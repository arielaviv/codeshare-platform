import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { Book, type IBookChapter } from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { craftBibleFor } from '../writing/craft-bible';
import { chunkTextByParagraph, rejoinChunks, type TextChunk } from '../writing/chunk-text';
import { loadE2BConfig, connectComputeSandbox } from '../computer/e2b-client';
import { upsertSession } from '../computer/e2b-session-store';

/**
 * Copy Editor — Slice 5 pass 3.
 *
 * Per-chapter, chunked, grammar-only. Haiku (cheap, high-volume, perfect
 * for mechanical fixes). Zero word-choice changes. Zero meaning changes.
 * Fixes the 12 gotchas + homograph ambiguities + transition smoothness.
 */

export interface CopyEditSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunCopyEditOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  /** If set, proof ONLY this chapter. */
  chapterN?: number;
  sessionId?: string;
}

const COPY_EDIT_MODEL = 'claude-haiku-4-5-20251001';
const SANDBOX_BOOK_DIR = '/home/user/book';
const CHUNK_TARGET_WORDS = 3000;
const CHUNK_TAIL_WORDS = 80;
// Copy editor should be even more conservative on length — no meaning changes.
const MIN_RATIO = 0.9;
const MAX_RATIO = 1.1;

const proofreadChunkTool: Tool = {
  name: 'proofread_chunk',
  description:
    "Return a grammar-corrected version of the chunk. Do NOT change word choice, meaning, or voice — ONLY fix the 12 gotchas, homograph ambiguities, smart-quote normalization, and missing commas. Include fixCount.",
  input_schema: {
    type: 'object' as const,
    properties: {
      correctedText: {
        type: 'string',
        description: 'The grammar-corrected chunk. Length within 90-110% of source.',
      },
      fixCount: {
        type: 'number',
        description: 'How many distinct grammar fixes were applied in this chunk.',
      },
      changeNotes: {
        type: 'string',
        description: 'ONE sentence, max 160 chars, describing what kinds of fixes were applied.',
      },
    },
    required: ['correctedText', 'fixCount', 'changeNotes'],
  },
};

interface ProofreadChunkToolInput {
  correctedText: string;
  fixCount: number;
  changeNotes: string;
}

const COPY_EDITOR_PROCEDURE = `## PROCEDURE

You will be sent ONE chunk of a chapter at a time. For each chunk:
1. Scan for grammar gotchas from the GRAMMAR GATE craft reference (your/you're, its/it's, than/then, subject-verb agreement, run-ons, comma splices, plural apostrophes, affect/effect, who/whom, fragments, dangling modifiers, pronoun case).
2. Scan for HOMOGRAPH ambiguities (lead/lead, tear/tear, wind/wind, close/close, record/record, minute/minute). Add context anchors only when ambiguity would break flow — do NOT restructure.
3. Normalize smart quotes ("" → " "), em-dashes (" — "), and ellipses ("…").
4. Smooth transitions at chunk boundaries only if a clear hiccup exists.
5. Call proofread_chunk with { correctedText, fixCount, changeNotes }.

DO NOT:
- Change word choice (that's the line editor's job, already done).
- Add or remove sentences.
- Reorder paragraphs.
- Rewrite anything that is merely stylistically questionable.

If there are zero fixes needed, return the chunk verbatim with fixCount=0.`;

function buildSystemPrompt(): string {
  return [
    `You are the Mr8 Copy Editor — the final grammar + mechanics pass. You do NOT touch voice or word choice. You fix mechanics only: the 12 gotchas, homograph ambiguities, smart quotes, em-dashes, ellipses.`,
    '',
    craftBibleFor({ purpose: 'copy-edit' }),
    '',
    COPY_EDITOR_PROCEDURE,
  ].join('\n');
}

function buildUserMessage(chunk: TextChunk): string {
  const tailBlock =
    chunk.precedingTail && chunk.precedingTail.length > 0
      ? `## PRECEDING TAIL (context only — do NOT rewrite)\n\n${chunk.precedingTail}\n\n---\n\n`
      : '';
  return `${tailBlock}## CHUNK TO PROOFREAD\n\n${chunk.text}`;
}

async function readChapterText(sandboxId: string, chapter: IBookChapter): Promise<string | null> {
  // Prefer edited → draft (line editor ran first ideally).
  const path = chapter.editedPath ?? chapter.draftPath;
  if (!path) return null;
  try {
    const config = loadE2BConfig();
    const sbx = await connectComputeSandbox(config, sandboxId);
    const content = await sbx.files.read(`${SANDBOX_BOOK_DIR}/${path}`);
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

async function writeProofedChapter(sandboxId: string, relativePath: string, text: string): Promise<void> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  await sbx.commands.run(`mkdir -p ${SANDBOX_BOOK_DIR}/proofed`, { timeoutMs: 5_000 }).catch(() => {});
  await sbx.files.write(`${SANDBOX_BOOK_DIR}/${relativePath}`, text);
}

function wordCountOf(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export async function runCopyEdit(opts: RunCopyEditOptions, writer: CopyEditSSEWriter): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
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
  if (!book.chapters || book.chapters.length === 0) {
    writer.send('error', { message: 'No chapters to copy-edit' });
    writer.end();
    return;
  }
  if (!book.sandboxId) {
    writer.send('error', { message: 'Book has no sandbox' });
    writer.end();
    return;
  }

  const client = new Anthropic({ apiKey });

  const scope =
    typeof opts.chapterN === 'number'
      ? book.chapters.filter((c) => c.n === opts.chapterN)
      : book.chapters;
  if (scope.length === 0) {
    writer.send('error', { message: `Chapter ${opts.chapterN} not found` });
    writer.end();
    return;
  }

  writer.send('stage_started', { stage: 'copy-edit', chapterCount: scope.length });

  let totalInput = 0;
  let totalOutput = 0;
  let totalFixes = 0;

  for (const chapter of scope) {
    const idx = book.chapters.findIndex((c) => c.n === chapter.n);
    if (idx < 0) continue;

    book.chapters[idx].status = 'proofing';
    book.chapters[idx].errorMessage = undefined;
    book.markModified('chapters');
    await book.save();

    const sourceText = await readChapterText(book.sandboxId, chapter);
    if (!sourceText || sourceText.trim().length === 0) {
      book.chapters[idx].status = 'error';
      book.chapters[idx].errorMessage = 'Source chapter empty';
      book.markModified('chapters');
      await book.save();
      writer.send('copy.chapter_error', { n: chapter.n, message: 'Source empty' });
      continue;
    }

    writer.send('copy.chapter_start', { n: chapter.n, title: chapter.title });

    const chunks = chunkTextByParagraph(sourceText, {
      targetWords: CHUNK_TARGET_WORDS,
      tailWords: CHUNK_TAIL_WORDS,
    });

    const proofedChunks: TextChunk[] = [];
    let chapterFixes = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      try {
        const response = await client.messages.create({
          model: COPY_EDIT_MODEL,
          max_tokens: 4096,
          system: buildSystemPrompt(),
          tools: [proofreadChunkTool],
          tool_choice: { type: 'tool', name: 'proofread_chunk' },
          messages: [{ role: 'user', content: buildUserMessage(chunk) }],
        });
        totalInput += response.usage?.input_tokens ?? 0;
        totalOutput += response.usage?.output_tokens ?? 0;

        const toolUse = response.content.find((b) => b.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'proofread_chunk') {
          throw new Error('Copy editor did not return via proofread_chunk');
        }
        const input = toolUse.input as ProofreadChunkToolInput;
        const sourceWords = wordCountOf(chunk.text);
        const editedWords = wordCountOf(input.correctedText ?? '');
        const ratio = sourceWords === 0 ? 1 : editedWords / sourceWords;
        if (!input.correctedText || input.correctedText.trim().length === 0 || ratio < MIN_RATIO || ratio > MAX_RATIO) {
          proofedChunks.push({ ...chunk }); // keep source
          writer.send('copy.chunk_skipped', { n: chapter.n, chunkIdx: ci, reason: `ratio ${ratio.toFixed(2)} out of ${MIN_RATIO}-${MAX_RATIO}` });
          continue;
        }
        proofedChunks.push({ ...chunk, text: input.correctedText.trim() });
        chapterFixes += typeof input.fixCount === 'number' ? input.fixCount : 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        proofedChunks.push({ ...chunk });
        writer.send('copy.chunk_skipped', { n: chapter.n, chunkIdx: ci, reason: msg });
      }
    }

    const assembled = rejoinChunks(proofedChunks);
    const relativePath = `proofed/ch${String(chapter.n).padStart(2, '0')}.md`;
    try {
      await writeProofedChapter(book.sandboxId, relativePath, assembled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      book.chapters[idx].status = 'error';
      book.chapters[idx].errorMessage = `Failed to save proofed chapter: ${msg}`;
      book.markModified('chapters');
      await book.save();
      writer.send('copy.chapter_error', { n: chapter.n, message: msg });
      continue;
    }

    book.chapters[idx].status = 'proofed';
    book.chapters[idx].proofedPath = relativePath;
    book.chapters[idx].wordCount = wordCountOf(assembled);
    book.markModified('chapters');
    await book.save();

    totalFixes += chapterFixes;
    writer.send('copy.chapter_done', {
      n: chapter.n,
      wordCount: book.chapters[idx].wordCount,
      fixCount: chapterFixes,
      proofedPath: relativePath,
    });
  }

  // Unpause sandbox
  try {
    const config = loadE2BConfig();
    const sbx = await connectComputeSandbox(config, book.sandboxId);
    await sbx.pause().catch(() => {});
    upsertSession(opts.userId.toString(), { status: 'paused' });
  } catch {
    // ignore
  }

  try {
    await UsageEvent.create({
      userId: opts.userId,
      sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
      feature: 'book-copy-edit',
      modelName: COPY_EDIT_MODEL,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    });
  } catch {
    // ignore
  }

  writer.send('stage_complete', {
    stage: 'copy-edit',
    status: 'done',
    summary: totalFixes === 0 ? 'No grammar fixes needed.' : `Applied ${totalFixes} grammar fix${totalFixes === 1 ? '' : 'es'} across ${scope.length} chapter${scope.length === 1 ? '' : 's'}.`,
  });
}
