import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { Book, type EditAggressiveness, type IBookAuditIssue, type IBookChapter } from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { craftBibleFor } from '../writing/craft-bible';
import { chunkTextByParagraph, rejoinChunks, type TextChunk } from '../writing/chunk-text';
import { loadE2BConfig, connectComputeSandbox } from '../computer/e2b-client';
import { upsertSession } from '../computer/e2b-session-store';

/**
 * Line Editor — Slice 5 pass 2.
 *
 * Per-chapter, chunked, voice-preserving polish. Applies audit-issue fixes
 * scoped to each chapter's range. Discards any chunk rewrite that balloons
 * >30% or shrinks <70% of source length, OR whose self-reported
 * `voicePreserved` flag is false. The safeguard is why we use Sonnet here
 * (judgment-sensitive) rather than Haiku.
 */

export interface LineEditSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunLineEditOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  aggressiveness: EditAggressiveness;
  directives?: string;
  /** If set, edit ONLY this chapter (used by the regenerate-one-chapter flow). */
  chapterN?: number;
  sessionId?: string;
}

const LINE_EDIT_MODEL = 'claude-sonnet-4-6';
const SANDBOX_BOOK_DIR = '/home/user/book';
const CHUNK_TARGET_WORDS = 2500;
const CHUNK_TAIL_WORDS = 200;
const MIN_RATIO = 0.7;
const MAX_RATIO = 1.3;

const rewriteChunkTool: Tool = {
  name: 'rewrite_chunk',
  description:
    "Return the line-edited version of the chunk. ALWAYS preserve the author's voice — every paragraph recognizable but cleaner. Include a one-sentence changeNotes. Set voicePreserved=false if you know you drifted.",
  input_schema: {
    type: 'object' as const,
    properties: {
      editedText: {
        type: 'string',
        description: 'The edited chunk. Length should be within 70–130% of source.',
      },
      changeNotes: {
        type: 'string',
        description: 'ONE sentence, max 160 chars, describing what changed.',
      },
      voicePreserved: {
        type: 'boolean',
        description: 'Self-check. If you rewrote sentences wholesale or changed tone, set false.',
      },
    },
    required: ['editedText', 'changeNotes', 'voicePreserved'],
  },
};

interface RewriteChunkToolInput {
  editedText: string;
  changeNotes: string;
  voicePreserved: boolean;
}

function aggressivenessDirective(level: EditAggressiveness): string {
  if (level === 'light') {
    return `## AGGRESSIVENESS — LIGHT (voice-first, minimal touch)

ONLY:
- Remove dead words: very, really, just, quite, sort of, kind of, rather, a bit, actually, literally, basically, simply, merely.
- Fix obvious awkwardness (unnatural phrasings, clumsy constructions).
- Normalize smart quotes, em-dashes, and ellipses.

Do NOT rewrite sentences. Do NOT reorder paragraphs. Do NOT add or remove
sentences. Do NOT change word choice beyond the dead-word list above. Every
sentence should land recognizably close to the source — just cleaner.

After editing, the text should match source length within about ±10%.`;
  }
  if (level === 'standard') {
    return `## AGGRESSIVENESS — STANDARD (tighten the rhythm)

Light rules, PLUS:
- Tighten sentence rhythm: vary sentence length; no three consecutive same-length sentences.
- Vary paragraph openers: no more than two paragraphs in a row starting with the same pronoun.
- Cut redundancies where two sentences say roughly the same thing.
- Trim dialogue tags — prefer said/asked; swap gratuitous attribution for action beats.
- Fix echo words within 3 paragraphs (same distinctive word repeated unintentionally).

Still NO plot-level rewrites, NO paragraph reordering, NO adding scenes. The
voice is the author's — you are sharpening it, not replacing it.

Target length: source ±15%.`;
  }
  // heavy
  return `## AGGRESSIVENESS — HEAVY (restructure flabby prose)

Standard rules, PLUS:
- Replace weak verb+adverb pairs with stronger verbs ("walked quickly" → "hurried"; "said quietly" → "murmured"). Don't over-precision.
- Restructure paragraphs that sprawl past ~120 words without a beat.
- Break walls of text into shorter paragraphs where rhythm demands.
- Unify tense slips (draft drifts from past to present or vice versa).
- Eliminate passive-voice constructions that hide the subject.

Every paragraph must remain RECOGNIZABLE — same events, same voice, same
dialogue intent. You are a line editor with a sharper red pen, not a ghost
writer. The reader should read the edited version and know the author wrote
the original.

Target length: source ±20%.`;
}

function buildSystemPrompt(opts: {
  aggressiveness: EditAggressiveness;
  directives?: string;
  auditFixes: string[];
  hasFemalePov: boolean;
  genre?: string;
  tone?: string;
}): string {
  const craft = craftBibleFor({
    purpose: 'line-edit',
    genre: opts.genre,
    tone: opts.tone,
    hasFemalePov: opts.hasFemalePov,
  });
  const directiveBlock =
    opts.directives && opts.directives.trim().length > 0
      ? `\n## USER DIRECTIVE\n\n${opts.directives.trim()}\n\nApply this directive throughout the edit.\n`
      : '';
  const auditBlock =
    opts.auditFixes.length > 0
      ? `\n## AUDIT FIXES FOR THIS CHAPTER\n\nApply these specific fixes while editing (they come from the continuity audit):\n${opts.auditFixes.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
      : '';
  return [
    `You are the Mr8 Line Editor — a senior prose editor who has line-edited for Knopf and FSG. Your one commitment is: preserve the author's voice. Every paragraph recognizable — just sharper.`,
    '',
    craft,
    '',
    aggressivenessDirective(opts.aggressiveness),
    directiveBlock,
    auditBlock,
    `\n## PROCEDURE\n\nYou will be sent ONE chunk of a chapter at a time. For each chunk:\n1. Read the PRECEDING TAIL (if present) to catch the rhythm coming in. Do NOT rewrite the tail.\n2. Apply the aggressiveness level to the chunk.\n3. Call rewrite_chunk with { editedText, changeNotes, voicePreserved }.\n\nIf you cannot preserve voice (because the source is too rough, or the aggressiveness level demands more than is safe), set voicePreserved=false and return your best attempt. The system will keep the source for that chunk.`,
  ].join('\n');
}

function buildUserMessage(chunk: TextChunk): string {
  const tailBlock =
    chunk.precedingTail && chunk.precedingTail.length > 0
      ? `## PRECEDING TAIL (context only — do NOT rewrite)\n\n${chunk.precedingTail}\n\n---\n\n`
      : '';
  return `${tailBlock}## CHUNK TO EDIT\n\n${chunk.text}`;
}

async function readChapterText(sandboxId: string, chapter: IBookChapter): Promise<string | null> {
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

async function writeEditedChapter(sandboxId: string, relativePath: string, text: string): Promise<void> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  await sbx.commands.run(`mkdir -p ${SANDBOX_BOOK_DIR}/edited`, { timeoutMs: 5_000 }).catch(() => {});
  await sbx.files.write(`${SANDBOX_BOOK_DIR}/${relativePath}`, text);
}

function hasFemalePovFor(pov: string, tone: string): boolean {
  return /\bshe\b|\bher\b|\bfemale\b|\bwoman\b|\bgirl\b/i.test(`${pov} ${tone}`);
}

function auditFixesForChapter(issues: IBookAuditIssue[] | undefined, n: number): string[] {
  if (!issues) return [];
  return issues
    .filter((issue) => !issue.resolved && issue.chapterRange.includes(n))
    .map((issue) => `[${issue.kind}] ${issue.description} — Fix: ${issue.suggestedFix}`);
}

function markIssuesResolvedForChapter(
  issues: IBookAuditIssue[] | undefined,
  n: number
): { updated: IBookAuditIssue[]; changed: boolean } {
  if (!issues) return { updated: [], changed: false };
  let changed = false;
  const updated = issues.map((issue) => {
    if (!issue.resolved && issue.chapterRange.includes(n)) {
      changed = true;
      return { ...issue, resolved: true };
    }
    return issue;
  });
  return { updated, changed };
}

export async function runLineEdit(opts: RunLineEditOptions, writer: LineEditSSEWriter): Promise<void> {
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
    writer.send('error', { message: 'No chapters to edit' });
    writer.end();
    return;
  }
  if (!book.sandboxId) {
    writer.send('error', { message: 'Book has no sandbox' });
    writer.end();
    return;
  }

  const client = new Anthropic({ apiKey });
  const hasFemalePov = book.outline
    ? hasFemalePovFor(book.outline.pov, book.outline.tone)
    : false;

  const scope =
    typeof opts.chapterN === 'number'
      ? book.chapters.filter((c) => c.n === opts.chapterN)
      : book.chapters;
  if (scope.length === 0) {
    writer.send('error', { message: `Chapter ${opts.chapterN} not found` });
    writer.end();
    return;
  }

  // Persist the user's pick on the book for later re-runs.
  book.editingChoices = {
    aggressiveness: opts.aggressiveness,
    directives: opts.directives,
    chosenAt: new Date(),
  };
  await book.save();

  writer.send('stage_started', { stage: 'line-edit', chapterCount: scope.length });

  let totalInput = 0;
  let totalOutput = 0;

  for (const chapter of scope) {
    const idx = book.chapters.findIndex((c) => c.n === chapter.n);
    if (idx < 0) continue;

    // Flag drafting status.
    book.chapters[idx].status = 'editing';
    book.chapters[idx].errorMessage = undefined;
    book.chapters[idx].skippedChunkIdxs = [];
    book.markModified('chapters');
    await book.save();

    const sourceText = await readChapterText(book.sandboxId, chapter);
    if (!sourceText || sourceText.trim().length === 0) {
      book.chapters[idx].status = 'error';
      book.chapters[idx].errorMessage = 'Source chapter file empty or missing';
      book.markModified('chapters');
      await book.save();
      writer.send('edit.chapter_error', { n: chapter.n, message: 'Source file empty' });
      continue;
    }

    writer.send('edit.chapter_start', { n: chapter.n, title: chapter.title });

    const chunks = chunkTextByParagraph(sourceText, {
      targetWords: CHUNK_TARGET_WORDS,
      tailWords: CHUNK_TAIL_WORDS,
    });
    const auditFixes = auditFixesForChapter(book.auditIssues, chapter.n);

    const editedChunks: TextChunk[] = [];
    const skippedChunkIdxs: number[] = [];
    const changeNotes: string[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      writer.send('edit.chunk_start', { n: chapter.n, chunkIdx: ci, wordCount: wordCountOf(chunk.text) });

      const system = buildSystemPrompt({
        aggressiveness: opts.aggressiveness,
        directives: opts.directives,
        auditFixes: ci === 0 ? auditFixes : [], // only first chunk of a chapter sees the audit fixes (scope-appropriate)
        hasFemalePov,
        genre: book.outline?.genre,
        tone: book.outline?.tone,
      });

      try {
        const response = await client.messages.create({
          model: LINE_EDIT_MODEL,
          max_tokens: 4096,
          system,
          tools: [rewriteChunkTool],
          tool_choice: { type: 'tool', name: 'rewrite_chunk' },
          messages: [{ role: 'user', content: buildUserMessage(chunk) }],
        });
        totalInput += response.usage?.input_tokens ?? 0;
        totalOutput += response.usage?.output_tokens ?? 0;

        const toolUse = response.content.find((b) => b.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'rewrite_chunk') {
          throw new Error('Line editor did not return via rewrite_chunk');
        }
        const input = toolUse.input as RewriteChunkToolInput;
        const sourceWords = wordCountOf(chunk.text);
        const editedWords = wordCountOf(input.editedText ?? '');
        const ratio = sourceWords === 0 ? 1 : editedWords / sourceWords;
        const voiceOk = input.voicePreserved === true;
        const lenOk = ratio >= MIN_RATIO && ratio <= MAX_RATIO;

        if (!voiceOk || !lenOk || !input.editedText || input.editedText.trim().length === 0) {
          // Safeguard — keep source for this chunk so we don't ship runaway rewrites.
          editedChunks.push({ ...chunk }); // the source chunk
          skippedChunkIdxs.push(ci);
          writer.send('edit.chunk_skipped', {
            n: chapter.n,
            chunkIdx: ci,
            reason: !voiceOk ? 'voice not preserved' : !lenOk ? `length ratio ${ratio.toFixed(2)} out of ${MIN_RATIO}-${MAX_RATIO}` : 'empty edit',
          });
          continue;
        }

        editedChunks.push({ ...chunk, text: input.editedText.trim() });
        if (input.changeNotes && input.changeNotes.trim().length > 0) {
          changeNotes.push(input.changeNotes.trim().slice(0, 160));
        }
        writer.send('edit.chunk_done', {
          n: chapter.n,
          chunkIdx: ci,
          deltaWords: editedWords - sourceWords,
          voicePreserved: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        editedChunks.push({ ...chunk });
        skippedChunkIdxs.push(ci);
        writer.send('edit.chunk_skipped', { n: chapter.n, chunkIdx: ci, reason: msg });
      }
    }

    const assembled = rejoinChunks(editedChunks);
    const relativePath = `edited/ch${String(chapter.n).padStart(2, '0')}.md`;
    try {
      await writeEditedChapter(book.sandboxId, relativePath, assembled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      book.chapters[idx].status = 'error';
      book.chapters[idx].errorMessage = `Failed to save edited chapter: ${msg}`;
      book.markModified('chapters');
      await book.save();
      writer.send('edit.chapter_error', { n: chapter.n, message: msg });
      continue;
    }

    book.chapters[idx].status = 'edited';
    book.chapters[idx].editedPath = relativePath;
    book.chapters[idx].wordCount = wordCountOf(assembled);
    book.chapters[idx].editingNotes = changeNotes.slice(0, 3).join(' · ').slice(0, 500);
    book.chapters[idx].skippedChunkIdxs = skippedChunkIdxs.length > 0 ? skippedChunkIdxs : undefined;
    book.markModified('chapters');

    // Mark any audit issues scoped to this chapter as resolved — the line
    // editor was given their fix directives and applied them.
    const { updated, changed } = markIssuesResolvedForChapter(book.auditIssues, chapter.n);
    if (changed) {
      book.auditIssues = updated;
      book.markModified('auditIssues');
    }

    await book.save();

    writer.send('edit.chapter_done', {
      n: chapter.n,
      wordCount: book.chapters[idx].wordCount,
      skippedChunks: skippedChunkIdxs.length,
      editedPath: relativePath,
    });
  }

  // Unpause the sandbox before we exit to be a good citizen.
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
      feature: 'book-line-edit',
      modelName: LINE_EDIT_MODEL,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    });
  } catch {
    // ignore
  }

  writer.send('stage_complete', {
    stage: 'line-edit',
    status: 'done',
    summary: `Line-edited ${scope.length} chapter${scope.length === 1 ? '' : 's'} at "${opts.aggressiveness}" aggressiveness.`,
  });
}

function wordCountOf(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}
