import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import fs from 'fs';
import { Book, type IBookCoverVariant, type BookTitleTreatment, type BookTitlePosition } from '../models/Book';
import { UsageEvent } from '../models/UsageEvent';
import { loadE2BConfig, connectComputeSandbox } from './computer/e2b-client';
import { getSession, upsertSession } from './computer/e2b-session-store';
import { generateImageToFile, ImageGenerationError } from './image-generation';
import { resolveUserModel } from './model-select';

export interface BookCoverSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateBookCoverOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  /** When set, regenerate only this variant index (1-based). Skips briefing stage. */
  regenerateIdx?: number;
  /** Optional author name override to persist on the book. */
  author?: string;
  sessionId?: string;
  model?: string;
}

const COVER_IMAGE_SIZE = '1024x1536' as const; // 2:3 portrait — book cover ratio
const COVER_IMAGE_QUALITY = 'medium' as const;
const COVER_COUNT = 6;
const SANDBOX_BOOK_DIR = '/home/user/book';

const TITLE_TREATMENTS: BookTitleTreatment[] = [
  'bold-sans',
  'serif-elegant',
  'display-script',
  'condensed-tall',
  'distressed',
  'modern-mono',
];
const TITLE_POSITIONS: BookTitlePosition[] = ['top', 'center', 'bottom'];

const writeCoverBriefsTool: Tool = {
  name: 'write_cover_briefs',
  description: `Return exactly ${COVER_COUNT} distinct book-cover concepts for one book. Never return plain text; always call this tool.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      variants: {
        type: 'array',
        description: `Exactly ${COVER_COUNT} cover variants, each a distinct concept.`,
        items: {
          type: 'object',
          properties: {
            conceptName: {
              type: 'string',
              description:
                "Short label for this concept (e.g. 'Moody photographic — The Witness', 'Minimalist geometric — The Signal', 'Gothic typographic — The Return').",
            },
            brief: {
              type: 'string',
              description:
                'Hand-written gpt-image-1 prompt, 120–220 words. Include subject, composition, palette (with real hex codes), lighting, texture, mood, explicit "no text, no letters, no words anywhere in the image", and explicit title-area reservation ("leave the upper third empty and softly vignetted for title placement"). Book cover in 2:3 portrait aspect.',
            },
            titleTreatment: {
              type: 'string',
              enum: TITLE_TREATMENTS,
              description:
                "Typographic treatment for the title overlay. Match the concept: bold-sans (modern/crisp), serif-elegant (literary/editorial), display-script (romance/fantasy cursive), condensed-tall (thriller/memoir), distressed (horror/gritty), modern-mono (sci-fi/tech).",
            },
            titleColor: {
              type: 'string',
              description: 'Hex color for the title text. Must have high contrast against the reserved title area. Example: #FFFFFF, #0B1220.',
            },
            authorColor: {
              type: 'string',
              description: 'Hex color for the author-name text. Often the titleColor at 75% opacity conceptually (pick an actual hex).',
            },
            titlePosition: {
              type: 'string',
              enum: TITLE_POSITIONS,
              description: "Where the title block sits: 'top', 'center', or 'bottom' third.",
            },
            paletteHexes: {
              type: 'array',
              items: { type: 'string' },
              description: '3–4 hex codes that define the cover palette. These should match the colors named in the brief.',
            },
          },
          required: [
            'conceptName',
            'brief',
            'titleTreatment',
            'titleColor',
            'authorColor',
            'titlePosition',
            'paletteHexes',
          ],
        },
      },
    },
    required: ['variants'],
  },
};

interface CoverBriefToolInput {
  variants: Array<{
    conceptName: string;
    brief: string;
    titleTreatment: BookTitleTreatment;
    titleColor: string;
    authorColor: string;
    titlePosition: BookTitlePosition;
    paletteHexes: string[];
  }>;
}

const COVER_BRIEF_SYSTEM = `You are the Mr8 Cover Brief Director — a senior book-cover designer who has
art-directed 300+ Penguin / Knopf / Tor titles. Your job is to write ${COVER_COUNT}
DISTINCT art briefs for one book, each a complete standalone concept that
an image model (gpt-image-1) will render into cover art. The title and
author name will be composited OVER the art later with real typography —
never include text inside the art itself.

OUTPUT: Always call write_cover_briefs with exactly ${COVER_COUNT} variants. Never plain text.

THE BAR — what separates a cover that sells from one that looks AI-made:

1. THUMBNAIL FIRST. Covers are seen at 90×140px on Amazon. If the concept
   doesn't read at that size, it doesn't ship. A single dominant focal
   point, high contrast, bold shapes.

2. THREE-SECOND RULE. A browsing reader decides in 3 seconds. The cover
   must telegraph: (a) genre, (b) tone, (c) one provocative hook — in
   that order, without reading the title.

3. TITLE AREA. Reserve clean negative space in one of: upper third,
   centered band, or lower third. Specify this in the brief so the image
   model leaves room (e.g. "the lower third is a wash of deep navy with
   a subtle film-grain texture, leaving room for title placement").
   The title will be composited later — NEVER include the title or
   author name inside the image prompt itself. Every brief must contain
   the sentence: "No text, letters, words, or characters anywhere in
   the image."

4. GENRE LANGUAGE (non-negotiable; read the outline's declared genre
   and tone and match):
   - Literary fiction  → restrained, editorial, one image metaphor,
                         muted palette; serif-elegant or condensed-tall
   - Thriller / crime  → dark, stark, sharp angles, red/black/ice-blue;
                         bold-sans or distressed
   - Sci-fi            → graphic, geometric, cool palette, negative
                         space; modern-mono or display-script
   - Fantasy           → illustrated, rich, painterly, jewel tones;
                         serif-elegant or display-script
   - Romance           → warm palette, soft light, one figure or object
                         in soft focus; display-script
   - Children's        → flat illustration, saturated primaries, one
                         friendly character; bold-sans
   - Non-fiction       → minimalist, one symbolic object, high contrast
                         palette; bold-sans
   - Memoir            → collage / photo-texture layering, warm vintage
                         palette; serif-elegant
   - Horror / gothic   → dark hues, haunting subject, desaturated with
                         one accent color; distressed

5. SIX VARIANTS — a spread, not 6 variations of one idea. Pick 6 from
   these proven archetypes, favoring ones that fit the outline's genre
   and themes:
     - Moody photographic (one figure, cinematic light)
     - Single symbolic object on solid ground
     - Typographic hero (rich texture or gradient in the title area
       so the typesetter does the heavy lifting)
     - Illustrated hero (hand-painted or vector, painterly feel)
     - Collage / fragmented (memoir / essay / biography)
     - Minimalist geometric (non-fiction, literary, sci-fi)
     - Gothic / haunted (horror, mystery, dark literary)
     - Nature landscape with tiny figure (literary, adventure)

6. AVOID CLICHÉS. No "woman in red dress looking away", no
   "silhouette against sunset", no "glowing orb in hand", no
   stock-photo couples, no fantasy-map backgrounds, no generic
   "book-shaped" logos, no AI-generated hands, no AI-generated faces
   with uncanny eyes. If your first instinct feels familiar, push once
   more. The test is: would a Strand Books buyer put it on the front
   table?

7. 2025 TRENDS to exploit when they fit:
     - Bold oversized typography as primary design element
     - Collage / texture layering (memoir, essay, biography)
     - Illustrated over photographic (YA, cozy, middle grade)
     - Gothic revival (mystery, supernatural, literary horror)
     - Unexpected neon/vivid palettes (literary fiction, thriller)
     - Eco / soy-ink warmth (memoir, nature writing, slow literature)

8. BRIEF FORMAT — each \`brief\` field is 120–220 words of prose aimed
   at gpt-image-1. Must include:
   - Subject (what's in the frame, where, at what angle)
   - Composition (rule of thirds, centered, asymmetric, top-heavy, etc.)
   - Palette (3–4 named hex codes — the same codes go in paletteHexes)
   - Lighting (time of day, direction, quality — golden-hour rim, flat
     north-window, blown-out noon, bioluminescent, candlelit, etc.)
   - Texture (film grain, linen paper, glassine, chalk, watercolor, etc.)
   - Mood in one phrase
   - The explicit "No text, letters, words, or characters anywhere in
     the image." sentence
   - The explicit title-area reservation ("leave the upper/center/lower
     third empty and softly vignetted for title placement")
   - Aspect ratio: "2:3 portrait book-cover aspect ratio"

9. TITLE TREATMENTS available (pick the one that serves each concept
   — don't default to bold-sans for all six):
     - bold-sans     (Inter / Helvetica Black — modern, crisp)
     - serif-elegant (Playfair / Caslon — literary, editorial)
     - display-script (cursive — romance / fantasy only)
     - condensed-tall (Bebas Neue / Oswald — thriller / sports / memoir)
     - distressed    (weathered, cracked — horror / gritty crime)
     - modern-mono   (IBM Plex Mono — sci-fi, tech non-fiction)

10. COLOR CONTRAST. titleColor must sit with high contrast against the
    reserved title area described in the brief. If the lower third is
    navy, pick a cream or pale-gold titleColor — never navy-on-navy.

11. PALETTE COHERENCE. paletteHexes (3–4 codes) must be the same codes
    the brief names. Real, usable hex. No "magenta-ish" descriptions.

FAIL-CHECK before emitting:
- Are all ${COVER_COUNT} concepts GENRE-APPROPRIATE for the outline's declared genre?
- Are they DISTINCT (not 6 moody figures)?
- Does each brief explicitly forbid text in the image?
- Does each brief explicitly reserve space for title compositing?
- Are title treatments matched to the concept (variety across the 6)?
- Does titleColor have clear contrast against the reserved title area?
- Would ANY of these sit comfortably on a Strand Books front table?`;

function buildUserPrompt(
  title: string,
  sourcePrompt: string,
  outline: { genre: string; tone: string; pov: string; themes: string[] } | undefined
): string {
  const themes = outline?.themes?.length ? outline.themes.join(', ') : '(derive from the prompt)';
  const genre = outline?.genre ?? '(derive from the prompt)';
  const tone = outline?.tone ?? '(derive from the prompt)';
  const pov = outline?.pov ?? '(derive from the prompt)';
  return `BOOK TITLE: ${title}

ORIGINAL PROMPT: ${sourcePrompt}

GENRE: ${genre}
TONE: ${tone}
POV: ${pov}
THEMES: ${themes}

Draft ${COVER_COUNT} distinct cover concepts for this book following the directives.`;
}

function renderCoverBriefsMarkdown(
  title: string,
  variants: IBookCoverVariant[]
): string {
  const header = [
    `# ${title} — Cover Concepts`,
    ``,
    `Six distinct cover directions. Each \`brief\` is the prompt sent to gpt-image-1.`,
    `Title and author are composited over the art with CSS — no text is embedded in the raster.`,
    ``,
  ].join('\n');
  const body = variants
    .map(
      (v) =>
        `## ${v.idx}. ${v.conceptName}\n\n` +
        `- **Title treatment:** ${v.titleTreatment}\n` +
        `- **Title position:** ${v.titlePosition}\n` +
        `- **Title color:** ${v.titleColor}\n` +
        `- **Author color:** ${v.authorColor}\n` +
        `- **Palette:** ${v.paletteHexes.join(', ')}\n\n` +
        `### Brief\n\n${v.brief}\n`
    )
    .join('\n');
  return `${header}\n${body}`;
}

async function writeFileToSandbox(
  userId: string,
  sandboxId: string,
  relativePath: string,
  content: string | Buffer
): Promise<void> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  await sbx.commands.run(`mkdir -p ${SANDBOX_BOOK_DIR}`, { timeoutMs: 5_000 }).catch(() => {});
  // E2B files.write for text; for binary we read the file already on disk via fs and write bytes.
  if (typeof content === 'string') {
    await sbx.files.write(`${SANDBOX_BOOK_DIR}/${relativePath}`, content);
  } else {
    // Binary write — E2B accepts string/Buffer through the SDK.
    await sbx.files.write(`${SANDBOX_BOOK_DIR}/${relativePath}`, content as unknown as string);
  }
  await sbx.pause().catch(() => {});
  upsertSession(userId, { status: 'paused' });
}

async function writeMultipleToSandbox(
  userId: string,
  sandboxId: string,
  files: Array<{ relativePath: string; content: string | Buffer }>
): Promise<void> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  await sbx.commands.run(`mkdir -p ${SANDBOX_BOOK_DIR}`, { timeoutMs: 5_000 }).catch(() => {});
  for (const f of files) {
    try {
      if (typeof f.content === 'string') {
        await sbx.files.write(`${SANDBOX_BOOK_DIR}/${f.relativePath}`, f.content);
      } else {
        await sbx.files.write(`${SANDBOX_BOOK_DIR}/${f.relativePath}`, f.content as unknown as string);
      }
    } catch {
      // Skip failing file writes — sandbox drops should never fail the whole flow.
    }
  }
  await sbx.pause().catch(() => {});
  upsertSession(userId, { status: 'paused' });
}

/**
 * Generate (or regenerate) book covers for an existing Book.
 *
 * Full-run flow (regenerateIdx undefined):
 *   book_loaded → briefing_started → briefs_ready → cover_generating × 6
 *                → cover_ready × 6 → covers_complete → end
 *
 * Single-cover regenerate flow (regenerateIdx set):
 *   book_loaded → cover_generating → cover_ready → covers_complete → end
 */
export async function generateBookCovers(
  opts: GenerateBookCoverOptions,
  writer: BookCoverSSEWriter
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
    writer.end();
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    writer.send('error', { message: 'OPENAI_API_KEY not configured' });
    writer.end();
    return;
  }

  let book;
  try {
    book = await Book.findById(opts.bookId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Failed to load book: ${message}` });
    writer.end();
    return;
  }
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
    writer.send('error', { message: 'Book outline must be generated before covers' });
    writer.end();
    return;
  }

  if (opts.author && opts.author.trim().length > 0 && opts.author !== book.author) {
    book.author = opts.author.trim();
  }

  writer.send('book_loaded', {
    bookId: book._id.toString(),
    title: book.title,
    author: book.author ?? null,
    genre: book.outline.genre,
    tone: book.outline.tone,
  });

  const userIdStr = opts.userId.toString();

  // --- Regenerate single variant path ---------------------------------------
  if (opts.regenerateIdx) {
    const idx = opts.regenerateIdx;
    const existing = (book.coverVariants ?? []).find((v) => v.idx === idx);
    if (!existing) {
      writer.send('error', { message: `No existing variant at idx ${idx} to regenerate` });
      writer.end();
      return;
    }
    writer.send('cover_generating', { idx, conceptName: existing.conceptName });
    try {
      const imageResult = await generateImageToFile({
        userId: opts.userId,
        prompt: existing.brief,
        size: COVER_IMAGE_SIZE,
        quality: COVER_IMAGE_QUALITY,
        subdir: `books/${book._id.toString()}/covers`,
        filenameHint: `cover-${idx}-${Date.now().toString(36)}`,
        noCache: true,
      });
      existing.imageUrl = imageResult.imageUrl;
      existing.costCents = imageResult.costCents;
      book.markModified('coverVariants');
      await book.save();

      // Mirror the file into the sandbox so the Computer panel updates.
      if (book.sandboxId) {
        try {
          const bytes = fs.readFileSync(imageResult.filepath);
          await writeFileToSandbox(userIdStr, book.sandboxId, `cover-${String(idx).padStart(2, '0')}.png`, bytes);
        } catch {
          // ignore sandbox copy failure
        }
      }

      writer.send('cover_ready', {
        idx,
        imageUrl: existing.imageUrl,
        conceptName: existing.conceptName,
        brief: existing.brief,
        titleTreatment: existing.titleTreatment,
        titleColor: existing.titleColor,
        authorColor: existing.authorColor,
        titlePosition: existing.titlePosition,
        paletteHexes: existing.paletteHexes,
      });

      try {
        await UsageEvent.create({
          userId: opts.userId,
          sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
          feature: 'book-cover',
          modelName: 'gpt-image-1',
          inputTokens: 0,
          outputTokens: 0,
          costCents: existing.costCents,
        });
      } catch {
        // ignore
      }

      writer.send('covers_complete', { bookId: book._id.toString(), regeneratedIdx: idx });
    } catch (err) {
      const message = err instanceof ImageGenerationError
        ? (err.kind === 'billing'
            ? 'Image generation is paused — the OpenAI account attached to this server has run out of credit. Top up billing.openai.com and try again.'
            : err.message)
        : err instanceof Error
          ? err.message
          : String(err);
      writer.send('error', { message: `Cover regeneration failed: ${message}` });
    }
    writer.end();
    return;
  }

  // --- Full 6-up cover flow -------------------------------------------------
  book.status = 'cover-pending';
  await book.save();

  writer.send('briefing_started', { bookCount: COVER_COUNT });

  const coverModel = resolveUserModel(opts.model);

  // Stage A — brief the art
  let briefsInput: CoverBriefToolInput;
  let briefUsageInput = 0;
  let briefUsageOutput = 0;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: coverModel,
      max_tokens: 4096,
      system: COVER_BRIEF_SYSTEM,
      tools: [writeCoverBriefsTool],
      tool_choice: { type: 'tool', name: 'write_cover_briefs' },
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(book.title, book.sourcePrompt, book.outline),
        },
      ],
    });
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'write_cover_briefs') {
      throw new Error('Model did not return cover briefs');
    }
    briefsInput = toolUse.input as CoverBriefToolInput;
    briefUsageInput = response.usage?.input_tokens ?? 0;
    briefUsageOutput = response.usage?.output_tokens ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    book.status = 'error';
    book.errorMessage = message;
    await book.save();
    writer.send('error', { message: `Cover briefing failed: ${message}` });
    writer.end();
    return;
  }

  const normalizedVariants: IBookCoverVariant[] = (briefsInput.variants ?? [])
    .slice(0, COVER_COUNT)
    .map((v, i) => ({
      idx: i + 1,
      conceptName: (v.conceptName ?? `Variant ${i + 1}`).slice(0, 200),
      brief: (v.brief ?? '').slice(0, 2000),
      imageUrl: '',
      titleTreatment: TITLE_TREATMENTS.includes(v.titleTreatment) ? v.titleTreatment : 'bold-sans',
      titleColor: /^#[0-9a-fA-F]{6}$/.test(v.titleColor ?? '') ? v.titleColor : '#FFFFFF',
      authorColor: /^#[0-9a-fA-F]{6}$/.test(v.authorColor ?? '') ? v.authorColor : v.titleColor ?? '#FFFFFF',
      titlePosition: TITLE_POSITIONS.includes(v.titlePosition) ? v.titlePosition : 'center',
      paletteHexes: (v.paletteHexes ?? []).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h)),
      costCents: 0,
    }))
    .filter((v) => v.brief.length > 20);

  if (normalizedVariants.length === 0) {
    book.status = 'error';
    book.errorMessage = 'Cover briefs empty';
    await book.save();
    writer.send('error', { message: 'Cover briefs returned empty' });
    writer.end();
    return;
  }

  writer.send('briefs_ready', {
    count: normalizedVariants.length,
    variants: normalizedVariants.map((v) => ({
      idx: v.idx,
      conceptName: v.conceptName,
      titleTreatment: v.titleTreatment,
      titlePosition: v.titlePosition,
      titleColor: v.titleColor,
      authorColor: v.authorColor,
      paletteHexes: v.paletteHexes,
    })),
  });

  // Stage B — parallel art generation
  // Emit cover_generating for all slots so the picker can show 6 shimmers.
  for (const v of normalizedVariants) {
    writer.send('cover_generating', { idx: v.idx, conceptName: v.conceptName });
  }

  const bookIdStr = book._id.toString();
  const generated = await Promise.all(
    normalizedVariants.map(async (v) => {
      try {
        const result = await generateImageToFile({
          userId: opts.userId,
          prompt: v.brief,
          size: COVER_IMAGE_SIZE,
          quality: COVER_IMAGE_QUALITY,
          subdir: `books/${bookIdStr}/covers`,
          filenameHint: `cover-${v.idx}`,
        });
        v.imageUrl = result.imageUrl;
        v.costCents = result.costCents;
        writer.send('cover_ready', {
          idx: v.idx,
          imageUrl: v.imageUrl,
          conceptName: v.conceptName,
          brief: v.brief,
          titleTreatment: v.titleTreatment,
          titleColor: v.titleColor,
          authorColor: v.authorColor,
          titlePosition: v.titlePosition,
          paletteHexes: v.paletteHexes,
        });
        return { variant: v, filepath: result.filepath, ok: true as const };
      } catch (err) {
        const message = err instanceof ImageGenerationError
          ? (err.kind === 'billing'
              ? 'OpenAI credit exhausted. Top up billing.openai.com.'
              : err.message)
          : err instanceof Error
            ? err.message
            : String(err);
        writer.send('cover_failed', { idx: v.idx, conceptName: v.conceptName, message });
        return { variant: v, filepath: null, ok: false as const, message };
      }
    })
  );

  const successful = generated.filter((g) => g.ok).map((g) => g.variant);
  if (successful.length === 0) {
    book.status = 'error';
    book.errorMessage = 'All cover image generations failed';
    await book.save();
    writer.send('error', { message: 'All cover image generations failed' });
    writer.end();
    return;
  }

  book.coverVariants = successful;
  book.status = 'cover-ready';
  book.markModified('coverVariants');
  await book.save();

  // Best-effort: write cover-briefs.md + cover-XX.png into the E2B sandbox
  // so the Mr8 Computer panel reflects the artifacts alongside outline.md.
  if (book.sandboxId) {
    const files: Array<{ relativePath: string; content: string | Buffer }> = [
      { relativePath: 'cover-briefs.md', content: renderCoverBriefsMarkdown(book.title, successful) },
    ];
    for (const g of generated) {
      if (g.ok && g.filepath) {
        try {
          const bytes = fs.readFileSync(g.filepath);
          files.push({
            relativePath: `cover-${String(g.variant.idx).padStart(2, '0')}.png`,
            content: bytes,
          });
        } catch {
          // skip unreadable files
        }
      }
    }
    try {
      await writeMultipleToSandbox(userIdStr, book.sandboxId, files);
      writer.send('sandbox_synced', { fileCount: files.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writer.send('sandbox_sync_failed', { message });
    }
  }

  // Usage events — one briefing + one per successful cover.
  try {
    await UsageEvent.create({
      userId: opts.userId,
      sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
      feature: 'book-cover',
      modelName: coverModel,
      inputTokens: briefUsageInput,
      outputTokens: briefUsageOutput,
    });
    const totalImageCost = successful.reduce((acc, v) => acc + (v.costCents ?? 0), 0);
    await UsageEvent.create({
      userId: opts.userId,
      sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
      feature: 'book-cover',
      modelName: 'gpt-image-1',
      inputTokens: 0,
      outputTokens: 0,
      costCents: totalImageCost,
    });
  } catch {
    // ignore usage write failures
  }

  writer.send('covers_complete', {
    bookId: bookIdStr,
    successCount: successful.length,
    failedCount: COVER_COUNT - successful.length,
  });
  writer.end();
}
