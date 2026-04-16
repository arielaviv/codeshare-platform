import mongoose from 'mongoose';
import type { ToolContext, AgentTool } from '../tools/types';
import { executeTool as executeSharedTool, allToolDefinitions } from '../tools';
import { dispatchComputerTool, type DispatchContext } from '../computer/dispatch';
import type { ComputerSSEWriter } from '../computer/sse-writer';
import type { E2BClientConfig } from '../computer/e2b-client';
import { pythonTool, browserTool } from '../computer/tool-schemas';
import { Book, type IBook } from '../../models/Book';

/**
 * The book agent's unified tool dispatcher. Routes tool calls by name to the
 * right underlying executor:
 *
 *   python, browser                       → dispatchComputerTool (E2B handlers)
 *   write_file / read_file / list_files / delete_file / generate_image /
 *     fetch_unsplash_image / request_approval / complete_stage / etc.
 *                                          → executeSharedTool (shared toolbox)
 *
 * Normalizes the two result shapes (ToolResult vs string) into a single
 * { ok, content } envelope the outer agent loop can feed back to Anthropic.
 *
 * Also handles book-specific side effects that the shared tools can't know
 * about on their own — in particular, when the agent writes a file whose
 * path matches `chapters/chXX.md`, we update `book.chapters[n-1]` to
 * reflect 'drafted' status, draftPath, wordCount. Keeps the sidebar + Reader
 * reading from Mongo as the authoritative source.
 */

export interface BookAgentWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface BookAgentContext {
  /** Book id — used for side-effect updates to chapters[]. */
  bookId: string;
  /** User id — passed to both underlying dispatchers. */
  userId: mongoose.Types.ObjectId;
  /** The book record, live. We mutate and persist it on side-effect writes. */
  book: IBook;
  /** In-memory workspace shared with the shared tools (write_file/read_file). */
  workspace: Map<string, string>;
  /** Current tool_use id — tagged onto SSE events for frontend correlation. */
  toolCallId?: string;
  /** SSE writer — superset-compatible with SSEWriter and ComputerSSEWriter. */
  writer: BookAgentWriter;
  /** Optional shared E2B config; loaded lazily if omitted. */
  config?: E2BClientConfig;
  /** Which chapters have already been flagged as streaming. Avoids duplicate 'drafting' status flips. */
  flaggedDrafting: Set<number>;
  /** File-modification tracking for the shared tools (same set they all write to). */
  filesModified: Set<string>;
}

export interface DispatchResult {
  ok: boolean;
  /** String the loop feeds back to Anthropic as the tool_result content. */
  content: string;
  /** Whether the halt-signal tool was called. Loop must exit on true. */
  isTerminator?: boolean;
}

const COMPUTER_TOOL_NAMES = new Set(['python', 'browser']);

/**
 * Pattern to detect a draft chapter write. Matches:
 *   chapters/ch01.md, chapters/ch12.md, book/chapters/ch01.md, etc.
 */
const DRAFT_CHAPTER_PATH_RE = /(?:^|\/)chapters\/ch(\d{2})\.md$/;

export async function dispatchBookTool(
  name: string,
  input: unknown,
  ctx: BookAgentContext
): Promise<DispatchResult> {
  // Route 1 — python / browser go through the computer dispatcher.
  if (COMPUTER_TOOL_NAMES.has(name)) {
    const dispatchCtx: DispatchContext = {
      userId: ctx.userId.toString(),
      workspace: Object.fromEntries(ctx.workspace),
      sse: ctx.writer as unknown as ComputerSSEWriter, // superset-compatible
      config: ctx.config,
    };
    const result = await dispatchComputerTool(name, input, dispatchCtx);
    return {
      ok: result.ok,
      content: result.summary,
    };
  }

  // Route 2 — everything else goes through the shared toolbox.
  const toolCtx: ToolContext = {
    workspace: ctx.workspace,
    writer: ctx.writer,
    userId: ctx.userId,
    filesModified: ctx.filesModified,
    toolCallId: ctx.toolCallId,
  };

  let content: string;
  let ok = true;
  try {
    content = await executeSharedTool(name, input, toolCtx);
    // Shared tools return a string summary. Convention: "failed" prefix → not ok.
    // The specific tools we ship today say "<name> failed:" on errors; relax as
    // new tools join the registry.
    ok = !/\bfailed:/i.test(content.slice(0, 80));
  } catch (err) {
    ok = false;
    content = err instanceof Error ? err.message : String(err);
  }

  // Side effects — chapter tracking on writes.
  if (ok && name === 'write_file') {
    await applyChapterWriteSideEffects(input, ctx);
  }

  // Side effects — persist approval / stage-complete metadata onto the book.
  if (ok && name === 'request_approval') {
    await recordPendingApproval(input, ctx);
  }
  const isTerminator = name === 'complete_stage';
  if (ok && isTerminator) {
    await recordStageComplete(input, ctx);
  }

  return { ok, content, isTerminator };
}

// ---------------------------------------------------------------------------
// Side-effect helpers
// ---------------------------------------------------------------------------

interface WriteFileInputShape {
  path?: string;
  content?: string;
}

async function applyChapterWriteSideEffects(
  input: unknown,
  ctx: BookAgentContext
): Promise<void> {
  if (typeof input !== 'object' || input === null) return;
  const { path, content } = input as WriteFileInputShape;
  if (typeof path !== 'string' || typeof content !== 'string') return;
  const match = DRAFT_CHAPTER_PATH_RE.exec(path);
  if (!match) return;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1) return;

  const chapters = ctx.book.chapters ?? [];
  const idx = chapters.findIndex((c) => c.n === n);
  if (idx < 0) return; // chapter not materialized; ignore

  const ch = chapters[idx];
  ch.status = 'drafted';
  ch.draftPath = `chapters/ch${String(n).padStart(2, '0')}.md`;
  ch.wordCount = wordCountOf(content);
  ch.errorMessage = undefined;
  ctx.book.markModified('chapters');
  try {
    await ctx.book.save();
  } catch {
    // persistence failure is non-fatal to the agent loop; log via writer.
    ctx.writer.send('book_persist_error', { n, error: 'Failed to persist chapter status' });
    return;
  }
  ctx.writer.send('draft.chapter_ready', {
    n,
    path: ch.draftPath,
    wordCount: ch.wordCount,
  });
}

interface RequestApprovalInput {
  gate?: string;
  prompt?: string;
  options?: string[];
}

async function recordPendingApproval(input: unknown, ctx: BookAgentContext): Promise<void> {
  if (typeof input !== 'object' || input === null) return;
  const { gate, prompt, options } = input as RequestApprovalInput;
  if (!gate || !prompt || !Array.isArray(options)) return;
  // We stamp the pending approval onto the book's current stage meta.
  // Stage array materialization is light in Slice 4b — pushing a running
  // 'drafting' entry is enough; the Producer (Slice 4b+) formalizes this
  // into a proper state machine.
  try {
    await Book.updateOne(
      { _id: ctx.bookId },
      {
        $set: {
          'status': 'drafting',
          // pendingApproval captured on the book top-level for Slice 4b; the
          // Producer state machine (§II.8) picks it up.
          errorMessage: undefined,
        },
      }
    );
  } catch {
    // Non-fatal.
  }
}

interface CompleteStageInput {
  stage?: string;
  status?: string;
  summary?: string;
}

async function recordStageComplete(input: unknown, ctx: BookAgentContext): Promise<void> {
  if (typeof input !== 'object' || input === null) return;
  const { stage, status, summary } = input as CompleteStageInput;
  if (!stage || !status) return;
  // Mirror the stage status onto the top-level book.status when meaningful.
  // Slice 4b only formalizes drafting states; Slice 5+ add editing/format.
  try {
    if (stage === 'drafting' && status === 'done') {
      ctx.book.status = 'editing'; // next stage — editing is pending, producer will advance
      await ctx.book.save();
    } else if (stage === 'voice-check' && status === 'awaiting-approval') {
      // Intentionally no top-level status change; the approval card flow
      // drives the next stage when the user clicks.
    } else if (status === 'error') {
      ctx.book.status = 'error';
      ctx.book.errorMessage = `Stage ${stage}: ${summary ?? 'failed'}`;
      await ctx.book.save();
    }
  } catch {
    // Non-fatal.
  }
}

function wordCountOf(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Token bank — the union of Anthropic Tool schemas the book agent loop sends
 * to Anthropic every turn. Aggregates shared-toolbox definitions + the two
 * computer tools + (implicitly) request_approval / complete_stage which are
 * already in the shared toolbox.
 *
 * Caller imports this instead of building the array themselves.
 */
export function bookAgentToolDefinitions(): AgentTool['definition'][] {
  return [...allToolDefinitions, pythonTool, browserTool];
}
