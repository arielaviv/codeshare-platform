import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { Book, type IBookOutline, type IBookChapterOutline } from '../models/Book';
import { UsageEvent } from '../models/UsageEvent';
import { loadE2BConfig, createComputeSandbox, connectComputeSandbox } from './computer/e2b-client';
import { getSession, upsertSession } from './computer/e2b-session-store';
import { craftBibleFor } from './writing/craft-bible';
import { pickThemeForOutline } from './book/themes';
import { maybeInitChapters } from './book/chapter-init';

export interface BookAgentSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateBookOptions {
  prompt: string;
  targetWords?: number;
  sessionId?: string;
  userId: mongoose.Types.ObjectId;
}

const BOOK_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TARGET_WORDS = 2000;
const SANDBOX_BOOK_DIR = '/home/user/book';

const writeOutlineTool: Tool = {
  name: 'write_outline',
  description:
    'Return a complete chapter outline for the book. Always call this tool; never return plain text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Working title for the book (max 120 chars).',
      },
      genre: {
        type: 'string',
        description:
          "Genre label — e.g. 'literary fiction', 'sci-fi novella', 'non-fiction guide', 'children's picture book'.",
      },
      tone: {
        type: 'string',
        description:
          "One-line tone descriptor — e.g. 'introspective and quiet', 'fast-paced thriller', 'warm and conversational'.",
      },
      pov: {
        type: 'string',
        description:
          "Point of view — e.g. 'first-person', 'third-person-limited', 'third-person-omniscient', 'second-person'. For non-fiction default to 'second-person' (addressing the reader).",
      },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: '2–5 core themes or topics the book explores.',
      },
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'number', description: 'Chapter number, starting at 1.' },
            title: { type: 'string', description: 'Chapter title, 2–8 words.' },
            beat: {
              type: 'string',
              description:
                '1–3 sentence beat describing what happens / what is covered in this chapter. Concrete, not abstract.',
            },
            estimatedWords: {
              type: 'number',
              description: 'Target word count for this chapter. Sum across chapters must approximate the requested total.',
            },
          },
          required: ['n', 'title', 'beat', 'estimatedWords'],
        },
      },
      totalEstimatedWords: {
        type: 'number',
        description: 'Sum of per-chapter estimates; should match the requested total word count ±10%.',
      },
    },
    required: ['title', 'genre', 'tone', 'pov', 'themes', 'chapters', 'totalEstimatedWords'],
  },
};

interface OutlineToolInput {
  title: string;
  genre: string;
  tone: string;
  pov: string;
  themes: string[];
  chapters: IBookChapterOutline[];
  totalEstimatedWords: number;
}

function buildSystemPrompt(targetWords: number): string {
  // Outline prompts get VOICE_PREAMBLE + UNIVERSAL_THEMES + FEMALE_ARCHETYPES
  // as a reference pack. We don't know genre/POV yet at outline-generation time,
  // so we include archetypes unconditionally — the constant itself instructs
  // the model to apply them only when a female protagonist is present.
  const craft = craftBibleFor({ purpose: 'outline', hasFemalePov: true });

  return `You are a bestselling novelist and production editor. You have ghost-written across literary fiction, genre fiction (sci-fi, thriller, romance, YA, children's), and non-fiction (memoir, business, self-help, how-to). Your job right now is to produce a chapter-level outline that a drafting agent can execute cleanly.

${craft}

## TASK

OUTPUT: Always call the write_outline tool. Never return plain text.

TARGET LENGTH: ${targetWords} words total. Distribute across chapters so the sum is within ±10% of the target.

CHAPTER COUNT — pick what fits the target length. Rough guide:
- ≤ 2,500 words  → 3–5 chapters (very short; each chapter ~400–800 words)
- 2,500–10,000   → 5–10 chapters
- 10,000–30,000  → 10–16 chapters
- 30,000+        → 16–24 chapters

QUALITY BAR:

1. Every chapter must have a concrete BEAT — what actually happens or what is concretely taught. Not "introduces the theme of loss" but "Anna finds her father's lighthouse log and realizes the lamp has been writing back to him for years."

2. For FICTION: the outline must have a dramatic arc. Opening hook → inciting incident → rising complication → turn → climax → resolution. Identify which chapter does which job in the beat field if it isn't obvious. The 'themes' field should name AT LEAST TWO concrete universal themes from the craft reference above (e.g. "grief as inherited silence" not just "grief"), each expressed with a "because" clause baked in.

3. For NON-FICTION: each chapter teaches one clean idea. Beats should read like "By the end of this chapter the reader can X." No filler chapters that just "provide context."

4. CHILDREN'S books: keep chapters very short (~100–400 words), use concrete sensory language, one clear emotional turn per chapter.

5. Titles are 2–8 words, active voice, specific. "The Signal in the Light" beats "Chapter One: The Beginning." No generic "Introduction / Conclusion" — give them real titles.

6. Themes: 2–5 CONCRETE concepts the book explores — named by universal theme from the craft reference where applicable (e.g. "power as addiction through small compromises"). Never vague single-word labels ("identity", "loss") — always state what the story ARGUES about the topic.

7. POV: pick one and commit. For non-fiction default to second-person ("you") addressing the reader. For fiction pick what the genre expects; never mix POVs unless the user explicitly asked. If the protagonist is female, note in the tone/beat fields which archetype leads and whether a shift is expected across the arc.

8. TONE: one tight sentence. Think of it as a director's note — "introspective and quiet, like Marilynne Robinson" or "fast-paced and propulsive, like Blake Crouch."

FAIL-CHECK before emitting:
- Does every chapter have a concrete, specific beat? Rewrite vague ones.
- Do the per-chapter word estimates sum to within ±10% of the requested total?
- Is the chapter count appropriate for the target length?
- If fiction: is there a real dramatic arc, or just a list of vibes?
- Do the themes name universal-theme claims (with "because" clauses), not topics?
- Are titles specific and active, never "Introduction" / "Chapter 1" placeholders?
- Have you avoided any phrase from the NO LLM TELLS blacklist in titles and beats?`;
}

function renderOutlineMarkdown(
  title: string,
  sourcePrompt: string,
  outline: IBookOutline,
  targetWords: number
): string {
  const header = [
    `# ${title}`,
    ``,
    `> ${sourcePrompt}`,
    ``,
    `- **Genre:** ${outline.genre}`,
    `- **Tone:** ${outline.tone}`,
    `- **POV:** ${outline.pov}`,
    `- **Target length:** ~${targetWords.toLocaleString()} words`,
    `- **Outline total:** ~${outline.totalEstimatedWords.toLocaleString()} words`,
    ``,
    `## Themes`,
    ``,
    ...outline.themes.map((t) => `- ${t}`),
    ``,
    `## Chapters`,
    ``,
  ].join('\n');

  const chapters = outline.chapters
    .map(
      (c) =>
        `### ${c.n}. ${c.title}\n\n*~${c.estimatedWords.toLocaleString()} words*\n\n${c.beat}\n`
    )
    .join('\n');

  return `${header}${chapters}`;
}

async function acquireSandboxId(userId: string): Promise<string> {
  const config = loadE2BConfig();
  const session = getSession(userId);
  if (session?.computeSandboxId) {
    try {
      const existing = await connectComputeSandbox(config, session.computeSandboxId);
      return existing.sandboxId;
    } catch {
      // fall through — stale sandbox, create fresh
    }
  }
  const fresh = await createComputeSandbox(config);
  upsertSession(userId, { computeSandboxId: fresh.sandboxId, status: 'running' });
  return fresh.sandboxId;
}

async function writeOutlineToSandbox(
  userId: string,
  sandboxId: string,
  markdown: string
): Promise<void> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  await sbx.commands.run(`mkdir -p ${SANDBOX_BOOK_DIR}`, { timeoutMs: 5_000 }).catch(() => {});
  await sbx.files.write(`${SANDBOX_BOOK_DIR}/outline.md`, markdown);
  await sbx.pause().catch(() => {});
  upsertSession(userId, { status: 'paused' });
}

export async function generateBook(
  opts: GenerateBookOptions,
  writer: BookAgentSSEWriter
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
    writer.end();
    return;
  }
  if (!process.env.E2B_API_KEY) {
    writer.send('error', { message: 'E2B_API_KEY not configured' });
    writer.end();
    return;
  }

  const targetWords = opts.targetWords ?? DEFAULT_TARGET_WORDS;

  writer.send('book_started', { prompt: opts.prompt, targetWords });

  // 1. Spin up (or reuse) the E2B sandbox so the Computer panel has a
  //    real workspace to render.
  let sandboxId: string;
  try {
    sandboxId = await acquireSandboxId(opts.userId.toString());
    writer.send('sandbox_ready', { sandboxId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Sandbox acquire failed: ${message}` });
    writer.end();
    return;
  }

  // 2. Persist the Book document up-front in the outline-pending state so
  //    the frontend has something to reference even if outline generation
  //    later fails.
  const book = await Book.create({
    userId: opts.userId,
    sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
    title: opts.prompt.slice(0, 60).trim() || 'Untitled Book',
    sourcePrompt: opts.prompt,
    targetWords,
    language: 'en',
    sandboxId,
    status: 'outline-pending',
  });

  writer.send('book_created', { bookId: book._id.toString() });
  writer.send('outline_generating', { targetWords });

  // 3. Ask Claude for the outline via tool-use.
  let outlineInput: OutlineToolInput;
  let usageInput = 0;
  let usageOutput = 0;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: BOOK_MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(targetWords),
      tools: [writeOutlineTool],
      tool_choice: { type: 'tool', name: 'write_outline' },
      messages: [
        {
          role: 'user',
          content: `Draft a ${targetWords}-word book outline for this request:\n\n${opts.prompt}`,
        },
      ],
    });
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'write_outline') {
      throw new Error('Model did not return an outline');
    }
    outlineInput = toolUse.input as OutlineToolInput;
    usageInput = response.usage?.input_tokens ?? 0;
    usageOutput = response.usage?.output_tokens ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    book.status = 'error';
    book.errorMessage = message;
    await book.save();
    writer.send('error', { message: `Outline generation failed: ${message}` });
    writer.end();
    return;
  }

  // 4. Normalise and persist the outline.
  const outline: IBookOutline = {
    chapters: (outlineInput.chapters ?? [])
      .filter((c) => c && typeof c.n === 'number' && c.title && c.beat)
      .map((c) => ({
        n: c.n,
        title: c.title,
        beat: c.beat,
        estimatedWords: Math.max(0, Math.round(c.estimatedWords ?? 0)),
      }))
      .sort((a, b) => a.n - b.n),
    totalEstimatedWords: Math.max(
      0,
      Math.round(outlineInput.totalEstimatedWords ?? 0)
    ),
    themes: (outlineInput.themes ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0),
    pov: outlineInput.pov || 'third-person-limited',
    genre: outlineInput.genre || 'fiction',
    tone: outlineInput.tone || 'literary',
  };

  if (outline.chapters.length === 0) {
    book.status = 'error';
    book.errorMessage = 'Outline returned zero chapters';
    await book.save();
    writer.send('error', { message: 'Outline returned zero chapters' });
    writer.end();
    return;
  }

  book.title = outlineInput.title?.slice(0, 200).trim() || book.title;
  book.outline = outline;
  // AI auto-picks the book theme from the declared genre + tone.
  // Deterministic — same genre/tone always maps to the same theme.
  // User can override later via the Studio's Theme dropdown.
  book.themeId = pickThemeForOutline({ genre: outline.genre, tone: outline.tone });
  // Materialize book.chapters[] from the outline so the sidebar + Reader have
  // an authoritative per-chapter state record before drafting begins. Safe to
  // call multiple times — preserves any prior drafted/edited state.
  maybeInitChapters(book);
  book.status = 'outline-ready';
  await book.save();

  // 5. Write outline.md into the sandbox so the Computer panel shows the file.
  const outlineMarkdown = renderOutlineMarkdown(
    book.title,
    opts.prompt,
    outline,
    targetWords
  );
  try {
    await writeOutlineToSandbox(opts.userId.toString(), sandboxId, outlineMarkdown);
    writer.send('file_written', {
      path: 'book/outline.md',
      content: outlineMarkdown,
      sandboxPath: `${SANDBOX_BOOK_DIR}/outline.md`,
    });
  } catch (err) {
    // Don't fail the whole run if sandbox write fails — the DB copy is authoritative.
    const message = err instanceof Error ? err.message : String(err);
    writer.send('sandbox_write_failed', { message });
  }

  // 6. Emit outline_ready with the full structured outline so the frontend
  //    can render it inside chat without re-fetching.
  writer.send('outline_ready', {
    bookId: book._id.toString(),
    title: book.title,
    genre: outline.genre,
    tone: outline.tone,
    pov: outline.pov,
    themes: outline.themes,
    chapters: outline.chapters,
    totalEstimatedWords: outline.totalEstimatedWords,
    targetWords,
    themeId: book.themeId,
  });

  // 7. Usage event — best-effort.
  try {
    await UsageEvent.create({
      userId: opts.userId,
      sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
      feature: 'book-outline',
      modelName: BOOK_MODEL,
      inputTokens: usageInput,
      outputTokens: usageOutput,
    });
  } catch {
    // ignore
  }

  writer.send('book_complete', {
    bookId: book._id.toString(),
    stage: 'outline',
    title: book.title,
    chapterCount: outline.chapters.length,
  });
  writer.end();
}
