import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';

import {
  Book,
  type IBookBuildArtifact,
  type IBookChapter,
  type BookExportFormat,
} from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { BOOK_THEMES, type BookThemeId, type BookThemeSpec } from './themes';
import { loadE2BConfig, connectComputeSandbox } from '../computer/e2b-client';
import { upsertSession } from '../computer/e2b-session-store';
import { ensureFormatterToolchain } from './formatter-bootstrap';
import { readBinaryFromSandbox } from './sandbox-io';

/**
 * Formatter — Slice 7.ii.
 *
 * Given a book that has cleared the editing pipeline (proofed chapters on
 * disk via `chapter.proofedPath`), produce print-ready PDF / EPUB / DOCX
 * artifacts using pandoc + xelatex inside the user's E2B sandbox. Mirrors
 * each artifact to `/uploads/books/<userId>/<bookId>/build/<name>` so
 * downloads survive sandbox death and are servable via the existing
 * `/uploads` static route.
 *
 * Not a tool loop — straight orchestration, like `continuity-auditor.service`.
 *
 * Out of scope for 7.ii (handled by 7.iii): paperback/hardcover cover
 * wraps, copyright certificate PDF, KDP upload guide PDF, bundle zip.
 */

export interface FormatterSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunFormatBookOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  sessionId?: string;
  /** Which outputs to build. Defaults to the book's production.formats or ['pdf','epub','docx']. */
  formats?: BookExportFormat[];
  /**
   * Skip the "already-formatted, nothing changed" shortcut and force a full
   * rebuild. Wired to the Studio's "Re-format with new theme" button.
   */
  forceReformat?: boolean;
}

const SANDBOX_BOOK_DIR = '/home/user/book';
const SANDBOX_BUILD_DIR = `${SANDBOX_BOOK_DIR}/build`;
const SANDBOX_THEMES_DIR = `${SANDBOX_BOOK_DIR}/themes`;

const PANDOC_TIMEOUT_MS = 180_000; // 3 min per target — xelatex on a novella takes ~10s
const COVER_COMPOSITE_TIMEOUT_MS = 60_000;

const LOCAL_ASSETS_DIR = path.join(__dirname, 'themes', 'assets');
const LOCAL_UPLOADS_BASE = path.join(__dirname, '..', '..', '..', 'uploads', 'books');

/**
 * Resolve a theme asset on the backend's local filesystem.
 * `ensureAssetsOnDisk` runs once per call to surface a clear error if the
 * build has stripped them.
 */
function resolveThemeAsset(themeId: BookThemeId, file: 'header.tex' | 'epub.css'): string {
  return path.join(LOCAL_ASSETS_DIR, themeId, file);
}

function resolveSharedTemplate(): string {
  return path.join(LOCAL_ASSETS_DIR, '_shared', 'book.tex');
}

function ensureAssetsOnDisk(themeId: BookThemeId): void {
  const required = [
    resolveSharedTemplate(),
    resolveThemeAsset(themeId, 'header.tex'),
    resolveThemeAsset(themeId, 'epub.css'),
  ];
  const missing = required.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Missing theme assets on server: ${missing.map((p) => path.relative(process.cwd(), p)).join(', ')}`
    );
  }
}

/**
 * Convert a theme's trim size + margins into the `-V geometry:` string
 * pandoc's xelatex engine expects. Inches throughout.
 */
function buildGeometryString(theme: BookThemeSpec, overrideTrim?: string): string {
  const trim = (overrideTrim ?? theme.trimSize) as typeof theme.trimSize;
  const [wStr, hStr] = trim.split('x');
  const w = Number.parseFloat(wStr);
  const h = Number.parseFloat(hStr);
  return [
    `paperwidth=${w}in`,
    `paperheight=${h}in`,
    `top=${theme.marginTopIn}in`,
    `bottom=${theme.marginBottomIn}in`,
    `inner=${theme.marginInnerIn}in`,
    `outer=${theme.marginOuterIn}in`,
  ].join(',');
}

/**
 * Concatenate each chapter's best-available markdown, normalize scene
 * breaks, emit one `manuscript.md` ready for pandoc.
 *
 * Preference order per chapter: proofed > edited > raw draft. If a chapter
 * has none, it's skipped (with a warning written into the manuscript).
 */
async function buildManuscript(
  sbx: ComputeSandbox,
  chapters: IBookChapter[]
): Promise<{ manuscriptMd: string; includedChapters: number }> {
  const parts: string[] = [];
  let included = 0;
  for (const ch of chapters) {
    const relPath = ch.proofedPath ?? ch.editedPath ?? ch.draftPath;
    if (!relPath) {
      continue;
    }
    let body: string;
    try {
      const raw = await sbx.files.read(`${SANDBOX_BOOK_DIR}/${relPath}`);
      body = typeof raw === 'string' ? raw : String(raw);
    } catch {
      continue;
    }
    if (!body.trim()) continue;

    // Strip any existing `# Title` line if the drafter emitted one — we'll
    // add the canonical `# Title` ourselves below so pandoc's `--toc` picks
    // up the chapter title consistently.
    const stripped = body.replace(/^#\s+.*\n+/, '');
    // Replace standalone `***` scene break markers with a raw-LaTeX macro
    // the shared template defines. Safe in EPUB/DOCX too — pandoc passes
    // raw LaTeX through to TeX-only outputs and drops it from EPUB/DOCX
    // (which use the `<hr>` fallback). We emit BOTH so every target has a
    // working break.
    const sceneBreakSafe = stripped.replace(/^\s*\*\*\*\s*$/gm, '\n`\\sceneBreak`{=latex}\n\n---\n');

    parts.push(`# ${ch.title}\n\n${sceneBreakSafe.trim()}\n`);
    included++;
  }
  const manuscriptMd = parts.join('\n\n');
  return { manuscriptMd, includedChapters: included };
}

/**
 * Push the shared pandoc template + the selected theme's header.tex / epub.css
 * into the sandbox at `/home/user/book/themes/...`. Overwrites on every run
 * so theme changes propagate without a stale cache.
 */
async function stageThemeAssets(sbx: ComputeSandbox, themeId: BookThemeId): Promise<void> {
  await sbx.commands.run(
    `mkdir -p ${SANDBOX_THEMES_DIR}/_shared ${SANDBOX_THEMES_DIR}/${themeId}`,
    { timeoutMs: 5_000 }
  ).catch(() => {});

  const sharedTex = fs.readFileSync(resolveSharedTemplate(), 'utf8');
  const headerTex = fs.readFileSync(resolveThemeAsset(themeId, 'header.tex'), 'utf8');
  const epubCss = fs.readFileSync(resolveThemeAsset(themeId, 'epub.css'), 'utf8');

  await sbx.files.write(`${SANDBOX_THEMES_DIR}/_shared/book.tex`, sharedTex);
  await sbx.files.write(`${SANDBOX_THEMES_DIR}/${themeId}/header.tex`, headerTex);
  await sbx.files.write(`${SANDBOX_THEMES_DIR}/${themeId}/epub.css`, epubCss);
}

/**
 * Stamp title + author over the selected cover art and save
 * `build/cover-for-epub.png` at 1600×2560 (Kindle-max). Falls back to a
 * Liberation Serif font since we can't count on the theme's Google Font
 * being installed inside the sandbox.
 *
 * Sources the art from one of:
 *   1. `/home/user/book/cover-selected.png` (staged by the cover designer)
 *   2. `/home/user/book/cover-<NN>.png` at `selectedCoverIdx` (legacy)
 *
 * If neither exists we emit a plain-text fallback cover so the EPUB build
 * doesn't hard-fail — the user will see the issue in the cover preview.
 */
async function compositeEpubCover(
  sbx: ComputeSandbox,
  opts: {
    title: string;
    author: string;
    selectedCoverIdx?: number;
    titleColor?: string;
  }
): Promise<void> {
  const title = opts.title.replace(/"/g, '\\"');
  const author = (opts.author || '').replace(/"/g, '\\"');
  const titleColor = opts.titleColor ?? '#FFFFFF';

  const coverCandidates = [
    `${SANDBOX_BOOK_DIR}/cover-selected.png`,
    ...(opts.selectedCoverIdx
      ? [`${SANDBOX_BOOK_DIR}/cover-${String(opts.selectedCoverIdx).padStart(2, '0')}.png`]
      : []),
  ];

  const py = `
import os
from PIL import Image, ImageDraw, ImageFont

TITLE = """${title}"""
AUTHOR = """${author}"""
TITLE_COLOR = "${titleColor}"
CANDIDATES = ${JSON.stringify(coverCandidates)}
OUT = "${SANDBOX_BUILD_DIR}/cover-for-epub.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

W, H = 1600, 2560

def load_font(size):
    for p in [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

base = None
for p in CANDIDATES:
    if os.path.exists(p):
        try:
            img = Image.open(p).convert("RGB")
            base = img.resize((W, H), Image.LANCZOS)
            break
        except Exception:
            continue

if base is None:
    # Fallback — solid dark card so the EPUB still builds.
    base = Image.new("RGB", (W, H), (18, 18, 22))

draw = ImageDraw.Draw(base)

# Title — scale to fit 1400-wide, max 180pt, min 60pt.
def fits(font, text, max_w):
    bbox = draw.textbbox((0, 0), text, font=font)
    return (bbox[2] - bbox[0]) <= max_w

title_size = 180
while title_size > 60:
    f = load_font(title_size)
    if fits(f, TITLE, 1400):
        break
    title_size -= 8

title_font = load_font(title_size)
bbox = draw.textbbox((0, 0), TITLE, font=title_font)
title_w = bbox[2] - bbox[0]
title_h = bbox[3] - bbox[1]

# Place title in the upper-middle third; author below.
title_x = (W - title_w) // 2
title_y = int(H * 0.22)
draw.text((title_x + 4, title_y + 4), TITLE, font=title_font, fill=(0, 0, 0))
draw.text((title_x, title_y), TITLE, font=title_font, fill=TITLE_COLOR)

if AUTHOR.strip():
    author_font = load_font(max(64, title_size // 2))
    a_bbox = draw.textbbox((0, 0), AUTHOR, font=author_font)
    a_w = a_bbox[2] - a_bbox[0]
    author_x = (W - a_w) // 2
    author_y = title_y + title_h + 80
    draw.text((author_x + 3, author_y + 3), AUTHOR, font=author_font, fill=(0, 0, 0))
    draw.text((author_x, author_y), AUTHOR, font=author_font, fill=TITLE_COLOR)

base.save(OUT, "PNG", optimize=True)
print("OK", OUT, os.path.getsize(OUT))
`;

  const result = await sbx.runCode(py, { timeoutMs: COVER_COMPOSITE_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');
  if (!stdout.startsWith('OK')) {
    const stderr = (result.logs?.stderr ?? []).join('\n').slice(0, 600);
    throw new Error(`EPUB cover composite failed: ${stderr || 'no stdout'}`);
  }
}

/**
 * Shell-quote a value for safe interpolation into `sh -c "..."`. Single-
 * quotes everything, escaping any embedded single quotes the POSIX way.
 */
function sq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build one pandoc invocation for the given format. Returns the full
 * command string ready for `sbx.commands.run`.
 */
function buildPandocCommand(
  format: BookExportFormat,
  opts: {
    themeId: BookThemeId;
    theme: BookThemeSpec;
    title: string;
    author: string;
    geometry: string;
    manuscriptRel: string; // e.g. 'build/manuscript.md'
    epubCoverRel?: string; // e.g. 'build/cover-for-epub.png'
  }
): string {
  const { themeId, theme, title, author, geometry, manuscriptRel, epubCoverRel } = opts;

  const inputPath = `${SANDBOX_BOOK_DIR}/${manuscriptRel}`;
  const commonVars = [
    `-V title=${sq(title)}`,
    `-V author=${sq(author)}`,
    `-V lang=en`,
    `--metadata=title:${sq(title)}`,
    `--metadata=author:${sq(author)}`,
    `--metadata=lang:en`,
    `--toc`,
    `--toc-depth=1`,
    `--top-level-division=chapter`,
  ];

  if (format === 'pdf') {
    const outPath = `${SANDBOX_BUILD_DIR}/book.pdf`;
    return [
      'cd',
      sq(SANDBOX_BOOK_DIR),
      '&&',
      'pandoc',
      sq(inputPath),
      `-o ${sq(outPath)}`,
      `--pdf-engine=xelatex`,
      `--template=${sq(`${SANDBOX_THEMES_DIR}/_shared/book.tex`)}`,
      `-H ${sq(`${SANDBOX_THEMES_DIR}/${themeId}/header.tex`)}`,
      `-V mainfont=${sq(stripFontStack(theme.bodyFontFamily))}`,
      `-V sansfont=${sq('Inter')}`,
      `-V geometry:${geometry}`,
      ...commonVars,
    ].join(' ');
  }

  if (format === 'epub') {
    const outPath = `${SANDBOX_BUILD_DIR}/book.epub`;
    const coverArg = epubCoverRel
      ? `--epub-cover-image=${sq(`${SANDBOX_BOOK_DIR}/${epubCoverRel}`)}`
      : '';
    return [
      'cd',
      sq(SANDBOX_BOOK_DIR),
      '&&',
      'pandoc',
      sq(inputPath),
      `-o ${sq(outPath)}`,
      `--css=${sq(`${SANDBOX_THEMES_DIR}/${themeId}/epub.css`)}`,
      coverArg,
      ...commonVars,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // docx
  const outPath = `${SANDBOX_BUILD_DIR}/book.docx`;
  return [
    'cd',
    sq(SANDBOX_BOOK_DIR),
    '&&',
    'pandoc',
    sq(inputPath),
    `-o ${sq(outPath)}`,
    ...commonVars,
  ].join(' ');
}

/** Extract the first font family out of a CSS stack like `'EB Garamond', 'Garamond', serif`. */
function stripFontStack(stack: string): string {
  const first = stack.split(',')[0].trim();
  return first.replace(/^['"]|['"]$/g, '');
}

/**
 * Disk-mirror one sandbox file to `backend/uploads/books/<userId>/<bookId>/build/<name>`
 * and return an `IBookBuildArtifact` ready to push onto `book.artifacts[]`.
 */
async function mirrorArtifact(
  sbx: ComputeSandbox,
  opts: {
    userId: string;
    bookId: string;
    sandboxPath: string;
    artifactKind: IBookBuildArtifact['kind'];
    filename: string;
  }
): Promise<IBookBuildArtifact> {
  const bytes = await readBinaryFromSandbox(sbx, opts.sandboxPath);
  const localDir = path.join(LOCAL_UPLOADS_BASE, opts.userId, opts.bookId, 'build');
  fs.mkdirSync(localDir, { recursive: true });
  const localFile = path.join(localDir, opts.filename);
  fs.writeFileSync(localFile, bytes);
  const url = `/uploads/books/${opts.userId}/${opts.bookId}/build/${opts.filename}`;
  return {
    kind: opts.artifactKind,
    sandboxPath: opts.sandboxPath.replace(`${SANDBOX_BOOK_DIR}/`, ''),
    url,
    sizeBytes: bytes.byteLength,
    builtAt: new Date(),
    lang: 'en',
  };
}

/**
 * Pandoc target → artifact kind + filename. Kept together so adding a new
 * format (say, `md`) only needs one change.
 */
const TARGET_SPEC: Record<
  BookExportFormat,
  { kind: IBookBuildArtifact['kind']; filename: string; sandboxPath: string }
> = {
  pdf: { kind: 'pdf', filename: 'book.pdf', sandboxPath: `${SANDBOX_BUILD_DIR}/book.pdf` },
  epub: { kind: 'epub', filename: 'book.epub', sandboxPath: `${SANDBOX_BUILD_DIR}/book.epub` },
  docx: { kind: 'docx', filename: 'book.docx', sandboxPath: `${SANDBOX_BUILD_DIR}/book.docx` },
};

export async function formatBook(
  opts: RunFormatBookOptions,
  writer: FormatterSSEWriter
): Promise<void> {
  const started = Date.now();

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
    writer.send('error', { message: 'No chapters to format — draft the book first' });
    writer.end();
    return;
  }
  if (!book.sandboxId) {
    writer.send('error', { message: 'Book has no sandbox — draft the chapters first' });
    writer.end();
    return;
  }

  const themeId = book.themeId as BookThemeId;
  const theme = BOOK_THEMES[themeId];
  if (!theme) {
    writer.send('error', { message: `Unknown theme: ${themeId}` });
    writer.end();
    return;
  }

  try {
    ensureAssetsOnDisk(themeId);
  } catch (err) {
    writer.send('error', { message: err instanceof Error ? err.message : String(err) });
    writer.end();
    return;
  }

  const formats: BookExportFormat[] =
    opts.formats ?? book.production?.formats ?? ['pdf', 'epub', 'docx'];

  writer.send('stage_started', { stage: 'format', formats, themeId });
  writer.send('format.preflight', {
    chapterCount: book.chapters.length,
    themeId,
    trimSize: book.production?.trimSize ?? theme.trimSize,
  });

  book.status = 'formatting';
  await book.save();

  const config = loadE2BConfig();
  let sbx: ComputeSandbox;
  try {
    sbx = await connectComputeSandbox(config, book.sandboxId);
  } catch (err) {
    writer.send('error', {
      message: `Could not connect to sandbox: ${err instanceof Error ? err.message : String(err)}`,
    });
    writer.end();
    return;
  }

  const userIdStr = opts.userId.toString();
  const bookIdStr = book._id.toString();

  const builtArtifacts: IBookBuildArtifact[] = [];

  try {
    // --- Toolchain (lazy apt-install pandoc + xelatex) -----------------------
    await ensureFormatterToolchain(sbx, {
      onToolchainInstalling: () => writer.send('format.toolchain_installing', {}),
      onToolchainReady: () => writer.send('format.toolchain_ready', {}),
    });

    // --- Stage theme assets --------------------------------------------------
    writer.send('format.staging', { themeId });
    await stageThemeAssets(sbx, themeId);

    // --- Build the combined manuscript --------------------------------------
    writer.send('format.manuscript_building', {});
    const { manuscriptMd, includedChapters } = await buildManuscript(sbx, book.chapters);
    if (includedChapters === 0) {
      throw new Error('No chapter prose found on disk — nothing to format');
    }
    await sbx.commands.run(`mkdir -p ${SANDBOX_BUILD_DIR}`, { timeoutMs: 5_000 }).catch(() => {});
    await sbx.files.write(`${SANDBOX_BUILD_DIR}/manuscript.md`, manuscriptMd);
    writer.send('format.manuscript_ready', {
      chapters: includedChapters,
      sizeBytes: Buffer.byteLength(manuscriptMd, 'utf8'),
    });

    // --- Composite EPUB cover (only if we're building EPUB) ------------------
    let epubCoverRel: string | undefined;
    if (formats.includes('epub')) {
      writer.send('format.composite_cover', {});
      try {
        const selected = book.coverVariants?.find((v) => v.idx === book.selectedCoverIdx);
        await compositeEpubCover(sbx, {
          title: book.title,
          author: book.author ?? '',
          selectedCoverIdx: book.selectedCoverIdx,
          titleColor: selected?.titleColor,
        });
        epubCoverRel = 'build/cover-for-epub.png';
        const coverArtifact = await mirrorArtifact(sbx, {
          userId: userIdStr,
          bookId: bookIdStr,
          sandboxPath: `${SANDBOX_BUILD_DIR}/cover-for-epub.png`,
          artifactKind: 'cover-for-epub',
          filename: 'cover-for-epub.png',
        });
        builtArtifacts.push(coverArtifact);
        writer.send('format.cover_ready', {
          kind: 'cover-for-epub',
          url: coverArtifact.url,
          sizeBytes: coverArtifact.sizeBytes,
        });
      } catch (err) {
        // Non-fatal — EPUB will build without an embedded cover.
        writer.send('format.cover_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        epubCoverRel = undefined;
      }
    }

    // --- Pandoc targets (PDF / EPUB / DOCX) ---------------------------------
    const geometry = buildGeometryString(theme, book.production?.trimSize);

    for (const fmt of formats) {
      const spec = TARGET_SPEC[fmt];
      writer.send('format.building', { kind: spec.kind });

      const cmd = buildPandocCommand(fmt, {
        themeId,
        theme,
        title: book.title,
        author: book.author ?? '',
        geometry,
        manuscriptRel: 'build/manuscript.md',
        epubCoverRel: fmt === 'epub' ? epubCoverRel : undefined,
      });

      const result = await sbx.commands.run(cmd, { timeoutMs: PANDOC_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        const stderr = (result.stderr || result.error || '').slice(0, 1200);
        throw new Error(`pandoc ${fmt} failed (exit ${result.exitCode}): ${stderr}`);
      }

      const artifact = await mirrorArtifact(sbx, {
        userId: userIdStr,
        bookId: bookIdStr,
        sandboxPath: spec.sandboxPath,
        artifactKind: spec.kind,
        filename: spec.filename,
      });
      builtArtifacts.push(artifact);

      writer.send('format.ready', {
        kind: spec.kind,
        url: artifact.url,
        sizeBytes: artifact.sizeBytes,
      });
    }

    // --- Merge artifacts into the book record -------------------------------
    const existing = (book.artifacts ?? []).filter(
      (a) => !builtArtifacts.some((b) => b.kind === a.kind && (a.lang ?? 'en') === (b.lang ?? 'en'))
    );
    book.artifacts = [...existing, ...builtArtifacts];
    book.markModified('artifacts');
    // Leave status at 'formatting' until the user explicitly bundles (7.iii)
    // or re-enters a later stage. 7.iii will flip to 'bundling' → 'done'.
    await book.save();

    // --- Usage accounting ----------------------------------------------------
    try {
      await UsageEvent.create({
        userId: opts.userId,
        sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
        feature: 'book-format',
        modelName: 'pandoc+xelatex',
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      });
    } catch {
      // best-effort
    }

    writer.send('stage_complete', {
      stage: 'format',
      status: 'done',
      durationMs: Date.now() - started,
      artifacts: builtArtifacts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Formatter failed: ${message}` });
    try {
      book.status = 'editing'; // revert out of 'formatting' so the UI unlocks
      book.errorMessage = message.slice(0, 1000);
      await book.save();
    } catch {
      // ignore
    }
  } finally {
    try {
      await sbx.pause();
      upsertSession(userIdStr, { status: 'paused' });
    } catch {
      // ignore
    }
    writer.end();
  }
}
