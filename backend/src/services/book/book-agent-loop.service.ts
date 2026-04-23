import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { Book, type IBook } from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { craftBibleFor } from '../writing/craft-bible';
import {
  loadE2BConfig,
  connectComputeSandbox,
  createComputeSandbox,
} from '../computer/e2b-client';
import { getSession, upsertSession } from '../computer/e2b-session-store';
import {
  bookAgentToolDefinitions,
  dispatchBookTool,
  type BookAgentContext,
  type BookAgentWriter,
} from './chapter-dispatcher';
import { maybeInitChapters, resetChapterForRegenerate } from './chapter-init';
import { resolveUserModel } from '../model-select';

/**
 * Book agent loop — the tool-looped drafter that runs inside the shared E2B
 * sandbox. Clones the structure of computer-agent.service.ts but with three
 * deliberate divergences (see plan §4b):
 *
 *   1. Streaming — uses client.messages.stream() so input_json_delta events
 *      for write_file calls with chapters/chXX.md paths are forwarded as
 *      draft.chapter_streaming deltas for the live-paginating Reader.
 *   2. Tool registry — union of shared toolbox + python/browser, so the
 *      agent has everything every other module has plus its two new verbs
 *      (request_approval, complete_stage) already in the shared toolbox.
 *   3. Halt condition — loop exits on complete_stage in addition to the
 *      usual stop_reason !== 'tool_use'.
 */

export interface BookAgentSSEWriter extends BookAgentWriter {}

export type BookDraftStage = 'voice-check' | 'remaining' | 'regenerate-chapter';

export interface DraftBookOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  stage: BookDraftStage;
  /** Required when stage='regenerate-chapter'. */
  chapterN?: number;
  /** User-authored note, appended to the system prompt. */
  directive?: string;
  sessionId?: string;
  model?: string;
}

const MAX_ITERATIONS = 40;
const MAX_TOKENS_PER_TURN = 8192;

export async function runBookAgent(
  opts: DraftBookOptions,
  writer: BookAgentSSEWriter
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
    writer.end();
    return;
  }
  const e2bKey = process.env.E2B_API_KEY;
  if (!e2bKey) {
    writer.send('error', { message: 'E2B_API_KEY not configured' });
    writer.end();
    return;
  }

  const book = await Book.findById(opts.bookId);
  if (!book) {
    writer.send('error', { message: 'Book not found' });
    writer.end();
    return;
  }
  if (book.userId.toString() !== opts.userId.toString()) {
    writer.send('error', { message: 'Book not accessible' });
    writer.end();
    return;
  }
  if (!book.outline) {
    writer.send('error', { message: 'Book has no outline — run outline stage first' });
    writer.end();
    return;
  }

  // Ensure chapters[] is materialized + any regenerate target is reset.
  maybeInitChapters(book);
  if (opts.stage === 'regenerate-chapter' && typeof opts.chapterN === 'number') {
    resetChapterForRegenerate(book, opts.chapterN);
  }
  await book.save();

  // Ensure we have a live E2B sandbox the agent can use for file I/O.
  const sandboxId = await acquireOrCreateSandbox(opts.userId.toString(), book);
  if (!sandboxId) {
    writer.send('error', { message: 'Failed to acquire E2B sandbox' });
    writer.end();
    return;
  }

  writer.send('book_agent_started', {
    bookId: book._id.toString(),
    stage: opts.stage,
    iterationCap: MAX_ITERATIONS,
  });

  // Mark the targeted chapter(s) as 'drafting' up-front so the sidebar reacts
  // before any token arrives.
  flagDraftingStart(book, opts);
  await book.save();

  const client = new Anthropic({ apiKey });
  const tools = bookAgentToolDefinitions();
  const systemPrompt = buildSystemPrompt(book, opts);
  const draftModel = resolveUserModel(opts.model);

  const initialMessage = buildInitialUserMessage(book, opts);
  const apiMessages: MessageParam[] = [
    { role: 'user', content: initialMessage },
  ];

  const workspace = new Map<string, string>();
  const filesModified = new Set<string>();
  const flaggedDrafting = new Set<number>();
  if (opts.stage === 'regenerate-chapter' && opts.chapterN) flaggedDrafting.add(opts.chapterN);

  const start = Date.now();
  let iterations = 0;
  let terminated = false;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    while (iterations < MAX_ITERATIONS && !terminated) {
      iterations += 1;

      // --- Turn: stream Anthropic response -----------------------------------
      const stream = client.messages.stream({
        model: draftModel,
        max_tokens: MAX_TOKENS_PER_TURN,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      });

      // Per-tool_use cursor: how many chars of the "content" value we've
      // already forwarded as draft.chapter_streaming deltas.
      type BlockState = {
        toolName?: string;
        toolUseId?: string;
        chapterN?: number;
        cumulativeJson: string;
        emittedContentChars: number;
      };
      const blockStates = new Map<number, BlockState>();

      for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
        handleStreamEvent(event, blockStates, writer);
      }

      const response = await stream.finalMessage();
      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;

      // --- Post-turn: dispatch tool calls ------------------------------------
      const toolBlocks = response.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
      );

      if (response.stop_reason !== 'tool_use' || toolBlocks.length === 0) {
        // Model stopped without calling a tool — likely emitting final text.
        break;
      }

      const toolResultBlocks: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];

      for (const tb of toolBlocks) {
        writer.send('tool_call', {
          toolUseId: tb.id,
          name: tb.name,
          input: tb.input,
        });

        // Re-fetch the book before each tool dispatch in case a prior tool
        // call persisted state we need to see.
        const freshBook = await Book.findById(opts.bookId);
        if (!freshBook) {
          terminated = true;
          writer.send('error', { message: 'Book disappeared mid-run' });
          break;
        }

        const bookCtx: BookAgentContext = {
          bookId: opts.bookId,
          userId: opts.userId,
          book: freshBook,
          workspace,
          toolCallId: tb.id,
          writer,
          flaggedDrafting,
          filesModified,
        };
        const result = await dispatchBookTool(tb.name, tb.input, bookCtx);

        writer.send('tool_result', {
          toolUseId: tb.id,
          name: tb.name,
          ok: result.ok,
          summary: result.content,
        });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: result.content,
          is_error: !result.ok,
        });

        if (result.isTerminator) {
          terminated = true;
          // Keep pushing any remaining tool results so Anthropic sees them,
          // but we won't loop again.
        }
      }

      apiMessages.push({ role: 'assistant', content: response.content });
      apiMessages.push({ role: 'user', content: toolResultBlocks });
    }

    // UsageEvent — best-effort.
    try {
      await UsageEvent.create({
        userId: opts.userId,
        sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
        feature: 'book-draft-chapter',
        modelName: draftModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
    } catch {
      // ignore
    }

    writer.send('done', {
      iterations,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message, recoverable: true });
  } finally {
    writer.end();
  }
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

function handleStreamEvent(
  event: RawMessageStreamEvent,
  blockStates: Map<
    number,
    {
      toolName?: string;
      toolUseId?: string;
      chapterN?: number;
      cumulativeJson: string;
      emittedContentChars: number;
    }
  >,
  writer: BookAgentWriter
): void {
  switch (event.type) {
    case 'content_block_start': {
      const block = event.content_block;
      if (block.type === 'tool_use') {
        blockStates.set(event.index, {
          toolName: block.name,
          toolUseId: block.id,
          cumulativeJson: '',
          emittedContentChars: 0,
        });
      }
      return;
    }
    case 'content_block_delta': {
      if (event.delta.type === 'text_delta') {
        if (event.delta.text) writer.send('text_delta', { text: event.delta.text });
        return;
      }
      if (event.delta.type === 'input_json_delta') {
        const state = blockStates.get(event.index);
        if (!state) return;
        state.cumulativeJson += event.delta.partial_json;

        // If this tool call is a write_file, try to resolve the chapter number
        // from the path key, and forward any newly-appeared content chars as
        // a draft.chapter_streaming event.
        if (state.toolName === 'write_file') {
          if (state.chapterN === undefined) {
            const n = parseChapterNFromPath(state.cumulativeJson);
            if (n !== null) state.chapterN = n;
          }
          if (state.chapterN !== undefined) {
            const currentContent = extractGrowingContent(state.cumulativeJson);
            if (currentContent !== null && currentContent.length > state.emittedContentChars) {
              const delta = currentContent.slice(state.emittedContentChars);
              state.emittedContentChars = currentContent.length;
              writer.send('draft.chapter_streaming', {
                n: state.chapterN,
                delta,
                toolUseId: state.toolUseId,
              });
            }
          }
        }
        return;
      }
      return;
    }
    case 'content_block_stop': {
      // Nothing to do — the final message we read post-loop has the full
      // tool_use input, and any remaining content delta was already emitted
      // during the incremental events above.
      return;
    }
    default:
      return;
  }
}

/**
 * Extract chapter number from the `path` field of a growing write_file input
 * JSON. Assumes Anthropic emits fields in declared schema order (path before
 * content). Returns null if the path value isn't complete yet.
 */
function parseChapterNFromPath(cumulativeJson: string): number | null {
  const m = /"path"\s*:\s*"([^"]*)"/.exec(cumulativeJson);
  if (!m) return null;
  const pathMatch = /chapters\/ch(\d{2})\.md$/.exec(m[1]);
  if (!pathMatch) return null;
  const n = parseInt(pathMatch[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the current in-progress value of the `content` key from a
 * partially-accumulated JSON string. Handles JSON escape sequences.
 * Returns null if we haven't reached the content key yet.
 *
 * If the string value is still being streamed (no closing quote), returns
 * what we have so far — the loop's next delta will append to it. On closing
 * quote, returns the final value.
 */
function extractGrowingContent(cumulativeJson: string): string | null {
  const keyIdx = cumulativeJson.indexOf('"content"');
  if (keyIdx < 0) return null;

  // Advance past the key and colon to the opening quote.
  let i = keyIdx + '"content"'.length;
  while (i < cumulativeJson.length && cumulativeJson[i] !== '"') {
    if (cumulativeJson[i] !== ' ' && cumulativeJson[i] !== ':' && cumulativeJson[i] !== '\t') return null;
    i++;
  }
  if (i >= cumulativeJson.length) return null;
  const startOfValue = i + 1;

  let result = '';
  i = startOfValue;
  while (i < cumulativeJson.length) {
    const c = cumulativeJson[i];
    if (c === '\\' && i + 1 < cumulativeJson.length) {
      const next = cumulativeJson[i + 1];
      switch (next) {
        case 'n': result += '\n'; break;
        case 't': result += '\t'; break;
        case 'r': result += '\r'; break;
        case '"': result += '"'; break;
        case '\\': result += '\\'; break;
        case '/': result += '/'; break;
        case 'u': {
          if (i + 5 < cumulativeJson.length) {
            const hex = cumulativeJson.slice(i + 2, i + 6);
            const code = parseInt(hex, 16);
            if (Number.isFinite(code)) result += String.fromCharCode(code);
            i += 4;
          } else {
            // Incomplete \uXXXX — bail and return what we have so the next
            // delta completes it.
            return result;
          }
          break;
        }
        default:
          result += next;
      }
      i += 2;
    } else if (c === '"') {
      return result; // closing quote — string value complete
    } else {
      result += c;
      i += 1;
    }
  }
  // Ran out of buffer mid-value — return partial result; caller will re-check
  // on next delta.
  return result;
}

// ---------------------------------------------------------------------------
// System prompt assembly
// ---------------------------------------------------------------------------

const WORKSPACE_CONVENTIONS = `## WORKSPACE CONVENTIONS (Book module)

- The outline lives at /book/outline.md — read it with read_file(path='outline.md') first so you know the arc you're drafting into.
- Raw chapter drafts go to /book/chapters/chXX.md (chapter 1 is ch01.md, chapter 12 is ch12.md). Always use the ZERO-PADDED two-digit form.
- Before drafting chapter K (for K ≥ 2), call read_file(path='chapters/ch${'{K-1}'.padStart(2, '0')}.md') to retain continuity of names, tone, motifs, unresolved threads.
- If you need to revise the outline mid-draft, overwrite /book/outline.md with write_file — do NOT create outline-v2.md or sidecar variants.
- Use browser(action='search') ONLY to fact-check a real place, person, or piece of tech grounded in the real world. Do NOT use it to research made-up fiction.
- Use generate_image ONLY if the user has not yet selected a cover. Otherwise assume /book/cover-selected.png exists and is fine.
- When you finish writing a chapter, the file IS your output — do not emit the prose inline in a text block. Just call write_file. The live Reader streams the content as you fill it.
- Always call complete_stage as your FINAL tool call. Do not emit any text or further tool calls after complete_stage.`;

function buildSystemPrompt(book: IBook, opts: DraftBookOptions): string {
  const outline = book.outline!;
  const hasFemalePov = /\bshe\b|\bher\b|\bfemale\b|\bwoman\b|\bgirl\b/i.test(
    `${outline.pov} ${outline.tone}`
  );
  const craft = craftBibleFor({
    purpose: 'chapter-draft',
    genre: outline.genre,
    tone: outline.tone,
    hasFemalePov,
  });

  const stageDirective = (() => {
    if (opts.stage === 'voice-check') {
      return `## STAGE — VOICE CHECK

Write ONLY chapter 1 in this run. After writing it with
write_file(path='chapters/ch01.md', content='...'), call
request_approval({
  gate: 'voice-check',
  prompt: 'Chapter 1 is drafted. Does the voice feel right for the rest of the book?',
  options: ['Voice works → continue', 'Redraft tighter', 'Redraft warmer']
}).

Then call complete_stage({ stage: 'voice-check', status: 'awaiting-approval' }) and exit.

DO NOT draft chapters 2+ in this run. Do not emit text after request_approval.`;
    }
    if (opts.stage === 'remaining') {
      return `## STAGE — REMAINING CHAPTERS

Chapter 1 is already drafted at chapters/ch01.md (and the user approved the voice).
Write chapters 2 through ${outline.chapters.length} in order, one at a time.

For each chapter K (starting at K=2):
1. read_file(path='chapters/ch${'{K-1}'.padStart(2, '0')}.md') — retain continuity.
2. write_file(path='chapters/chXX.md', content='<the full chapter prose>') — one write per chapter.
3. Move to the next chapter.

After the final chapter is written, call
complete_stage({ stage: 'drafting', status: 'done', summary: '<one-line recap>' })
and exit.`;
    }
    // regenerate-chapter
    const n = opts.chapterN ?? 1;
    const padded = String(n).padStart(2, '0');
    const prevPadded = String(Math.max(1, n - 1)).padStart(2, '0');
    const nextPadded = String(n + 1).padStart(2, '0');
    return `## STAGE — REGENERATE CHAPTER ${n}

Only regenerate chapter ${n}. Do NOT touch other chapters.

1. read_file(path='chapters/ch${prevPadded}.md') — upstream context (if n > 1).
2. read_file(path='chapters/ch${nextPadded}.md') — downstream context (may not exist; skip on 404).
3. write_file(path='chapters/ch${padded}.md', content='<the new chapter prose>') — OVERWRITES the existing draft.
4. complete_stage({ stage: 'regenerate-chapter', status: 'done', summary: 'Regenerated chapter ${n}.' }) and exit.`;
  })();

  const directive =
    opts.directive && opts.directive.trim().length > 0
      ? `\n\n## USER DIRECTIVE\n\n${opts.directive.trim()}\n\nApply this directive while drafting — it is the most important voice/tone cue.`
      : '';

  return `${craft}\n\n${WORKSPACE_CONVENTIONS}\n\n${stageDirective}${directive}`;
}

function buildInitialUserMessage(book: IBook, opts: DraftBookOptions): string {
  const outline = book.outline!;
  const outlineMd = outline.chapters
    .map(
      (c) =>
        `### Chapter ${c.n} — ${c.title} (target ~${c.estimatedWords} words)\n${c.beat}`
    )
    .join('\n\n');
  const header = `Book: ${book.title}
Author: ${book.author ?? '(blank — reader will fill)'}
Genre: ${outline.genre}
Tone: ${outline.tone}
POV: ${outline.pov}
Themes: ${outline.themes.join('; ')}

Target length: ${book.targetWords.toLocaleString()} words
Outline total: ${outline.totalEstimatedWords.toLocaleString()} words`;

  const stageHint = (() => {
    if (opts.stage === 'voice-check') return `Your first job: draft CHAPTER 1 only and then pause for voice approval.`;
    if (opts.stage === 'remaining') return `Your job: draft chapters 2 through ${outline.chapters.length} in order.`;
    return `Your job: regenerate chapter ${opts.chapterN} only.`;
  })();

  return `${header}\n\nOutline:\n\n${outlineMd}\n\n${stageHint}`;
}

// ---------------------------------------------------------------------------
// Sandbox acquisition + drafting flag
// ---------------------------------------------------------------------------

async function acquireOrCreateSandbox(userId: string, book: IBook): Promise<string | null> {
  const config = loadE2BConfig();
  // Reuse the session sandbox that already has /book/ populated.
  const session = getSession(userId);
  if (session?.computeSandboxId) {
    try {
      const sbx = await connectComputeSandbox(config, session.computeSandboxId);
      // Ping the sandbox's /book/outline.md — if it's there we're good.
      try {
        await sbx.files.read('/home/user/book/outline.md');
        upsertSession(userId, { status: 'running' });
        return sbx.sandboxId;
      } catch {
        // outline not in the sandbox; fall through to fresh create + rehydrate
      }
    } catch {
      // stale — create fresh
    }
  }
  const fresh = await createComputeSandbox(config);
  // Rehydrate /book/outline.md from the book record (outline.md content is
  // regenerated from the IBookOutline; it's deterministic).
  try {
    await fresh.commands.run('mkdir -p /home/user/book/chapters /home/user/book/edited /home/user/book/proofed');
    const outlineMd = renderOutlineMd(book);
    await fresh.files.write('/home/user/book/outline.md', outlineMd);
    upsertSession(userId, { computeSandboxId: fresh.sandboxId, status: 'running' });
    return fresh.sandboxId;
  } catch {
    return null;
  }
}

function renderOutlineMd(book: IBook): string {
  const outline = book.outline;
  if (!outline) return '';
  const chapters = outline.chapters
    .map((c) => `### ${c.n}. ${c.title} (~${c.estimatedWords}w)\n\n${c.beat}`)
    .join('\n\n');
  return [
    `# ${book.title}`,
    '',
    `- Genre: ${outline.genre}`,
    `- Tone: ${outline.tone}`,
    `- POV: ${outline.pov}`,
    `- Themes: ${outline.themes.join('; ')}`,
    `- Target: ${book.targetWords.toLocaleString()} words`,
    '',
    '## Chapters',
    '',
    chapters,
  ].join('\n');
}

function flagDraftingStart(book: IBook, opts: DraftBookOptions): void {
  if (!book.chapters) return;
  if (opts.stage === 'voice-check') {
    const ch = book.chapters.find((c) => c.n === 1);
    if (ch && ch.status === 'pending') {
      ch.status = 'drafting';
      book.markModified('chapters');
    }
  } else if (opts.stage === 'remaining') {
    for (const ch of book.chapters) {
      if (ch.n > 1 && ch.status === 'pending') {
        ch.status = 'drafting';
      }
    }
    book.markModified('chapters');
  } else if (opts.stage === 'regenerate-chapter' && opts.chapterN) {
    const ch = book.chapters.find((c) => c.n === opts.chapterN);
    if (ch) {
      ch.status = 'drafting';
      book.markModified('chapters');
    }
  }
}
