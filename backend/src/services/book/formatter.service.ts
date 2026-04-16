import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';

import {
  Book,
  type IBookBuildArtifact,
  type IBookChapter,
  type BookExportFormat,
  type BookTrimSize,
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
const COVER_WRAP_TIMEOUT_MS = 60_000;
const KIT_PDF_TIMEOUT_MS = 30_000;
const PAGE_COUNT_TIMEOUT_MS = 10_000;

/** KDP/IngramSpark spine-width constants (inches per page). */
const SPINE_WIDTH_WHITE_IPP = 0.002252;
const SPINE_WIDTH_CREAM_IPP = 0.0025;
const BLEED_IN = 0.125;
const HARDCOVER_FLAP_IN = 0.25;

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
 * Wraps a front/back-matter section in raw LaTeX so it gets its own page
 * with no running head or page number. Each section is centered vertically
 * on the page. Blank sections are skipped by the caller.
 */
function frontMatterBlock(title: string | null, body: string, centered = true): string {
  const safe = body.trim().replace(/\n{3,}/g, '\n\n');
  const titleLine = title ? `\\begin{center}\\textsc{${title}}\\end{center}\n\n` : '';
  const alignOpen = centered ? '\\begin{center}' : '';
  const alignClose = centered ? '\\end{center}' : '';
  return [
    '```{=latex}',
    '\\clearpage',
    '\\thispagestyle{empty}',
    '\\vspace*{\\fill}',
    alignOpen,
    '```',
    '',
    titleLine + safe,
    '',
    '```{=latex}',
    alignClose,
    '\\vspace*{\\fill}',
    '\\clearpage',
    '```',
    '',
  ].join('\n');
}

function defaultCopyrightPageText(title: string, author: string): string {
  const year = new Date().getUTCFullYear();
  const authorLine = author ? `© ${year} ${author}. All rights reserved.` : `© ${year}. All rights reserved.`;
  return [
    title,
    '',
    authorLine,
    '',
    'No part of this book may be reproduced without written permission.',
    '',
    'Typeset with Mr8.',
  ].join('\n');
}

/**
 * Concatenate each chapter's best-available prose, normalize scene breaks,
 * emit one `manuscript.md` ready for pandoc. Prepends front matter
 * (copyright / dedication / epigraph) and appends back matter
 * (acknowledgements / about the author) when those fields are set on the
 * book.
 *
 * Per-chapter prose preference order:
 *   manualText.proofed → manualText.edited → manualText.draft →
 *   sandbox proofedPath → sandbox editedPath → sandbox draftPath
 *
 * `manualText` comes from the inline Book Editor and is authoritative; it
 * lets the Formatter run without a live sandbox (e.g. after `sbx.pause()`
 * TTL expired between drafting and export).
 */
async function buildManuscript(
  sbx: ComputeSandbox,
  chapters: IBookChapter[],
  frontBack: {
    title: string;
    author: string;
    bio?: string;
    dedication?: string;
    epigraph?: string;
    acknowledgements?: string;
    copyrightPageText?: string;
  }
): Promise<{ manuscriptMd: string; includedChapters: number }> {
  const frontParts: string[] = [];
  const copyright = frontBack.copyrightPageText?.trim()
    ? frontBack.copyrightPageText.trim()
    : defaultCopyrightPageText(frontBack.title, frontBack.author);
  frontParts.push(frontMatterBlock(null, copyright, false));

  if (frontBack.dedication?.trim()) {
    frontParts.push(frontMatterBlock(null, `\\textit{${frontBack.dedication.trim()}}`, true));
  }
  if (frontBack.epigraph?.trim()) {
    frontParts.push(frontMatterBlock(null, frontBack.epigraph.trim(), true));
  }

  const chapterParts: string[] = [];
  let included = 0;
  for (const ch of chapters) {
    let body: string | undefined;

    const manual =
      ch.manualText?.proofed ?? ch.manualText?.edited ?? ch.manualText?.draft;
    if (manual && manual.trim()) {
      body = manual;
    } else {
      const relPath = ch.proofedPath ?? ch.editedPath ?? ch.draftPath;
      if (!relPath) continue;
      try {
        const raw = await sbx.files.read(`${SANDBOX_BOOK_DIR}/${relPath}`);
        body = typeof raw === 'string' ? raw : String(raw);
      } catch {
        continue;
      }
    }
    if (!body || !body.trim()) continue;

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

    chapterParts.push(`# ${ch.title}\n\n${sceneBreakSafe.trim()}\n`);
    included++;
  }

  const backParts: string[] = [];
  if (frontBack.acknowledgements?.trim()) {
    backParts.push(frontMatterBlock('Acknowledgements', frontBack.acknowledgements.trim(), false));
  }
  if (frontBack.bio?.trim() && frontBack.author) {
    backParts.push(frontMatterBlock('About the Author', frontBack.bio.trim(), false));
  }

  const manuscriptMd = [...frontParts, chapterParts.join('\n\n'), ...backParts]
    .filter((s) => s.trim().length > 0)
    .join('\n\n');
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

/**
 * Parse a `'6x9'` / `'5.5x8.5'` trim string into numeric [w, h] in inches.
 */
function parseTrim(trim: BookTrimSize): { w: number; h: number } {
  const [wStr, hStr] = trim.split('x');
  return { w: Number.parseFloat(wStr), h: Number.parseFloat(hStr) };
}

/**
 * Read the final PDF's page count via pypdf inside the sandbox. Used to
 * compute spine width for the cover wraps.
 */
async function readPdfPageCount(sbx: ComputeSandbox, pdfSandboxPath: string): Promise<number> {
  const py = `
from pypdf import PdfReader
r = PdfReader("${pdfSandboxPath}")
print("PAGES", len(r.pages))
`;
  const result = await sbx.runCode(py, { timeoutMs: PAGE_COUNT_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');
  const match = /PAGES\s+(\d+)/.exec(stdout);
  if (!match) {
    throw new Error(`Could not read PDF page count: ${stdout.slice(0, 200)}`);
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Generate paperback + hardcover cover wrap PDFs via reportlab inside the
 * sandbox. Lays out back cover (left), spine (center, rotated title +
 * author), front cover (right, cover art + title + author stamp). 300dpi.
 *
 * Cover art is loaded from the EPUB composite (`build/cover-for-epub.png`)
 * so the front panel matches the embedded EPUB cover. Back cover is a
 * solid-color panel seeded from the theme palette + a short generic
 * colophon — Slice 6 (Blurb Writer) will replace the colophon with the AI
 * back-cover blurb.
 */
async function generateCoverWraps(
  sbx: ComputeSandbox,
  opts: {
    title: string;
    author: string;
    pageCount: number;
    trim: BookTrimSize;
    themeAccentHex: string;
    blurb?: string;
  }
): Promise<{ paperbackPath: string; hardcoverPath: string }> {
  const { w: trimW, h: trimH } = parseTrim(opts.trim);
  const spinePaperback = opts.pageCount * SPINE_WIDTH_WHITE_IPP;
  const spineHardcover = opts.pageCount * SPINE_WIDTH_CREAM_IPP;

  // Escape strings for triple-quoted Python.
  const escape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  const py = `
import os
from reportlab.lib.pagesizes import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader

TITLE = """${escape(opts.title)}"""
AUTHOR = """${escape(opts.author)}"""
BLURB = """${escape(opts.blurb ?? 'Published with Mr8. Written with care. Thank you for reading.')}"""
ACCENT = "${opts.themeAccentHex}"
COVER_IMG = "${SANDBOX_BUILD_DIR}/cover-for-epub.png"

TRIM_W = ${trimW}
TRIM_H = ${trimH}
BLEED = ${BLEED_IN}
HARDCOVER_FLAP = ${HARDCOVER_FLAP_IN}

def wrap_dims(spine, hardcover):
    w = TRIM_W * 2 + spine + BLEED * 2
    h = TRIM_H + BLEED * 2
    if hardcover:
        w += HARDCOVER_FLAP * 2
    return (w * inch, h * inch, spine * inch)

def draw_wrap(out_path, spine_in, hardcover):
    W, H, spine = wrap_dims(spine_in, hardcover)
    c = canvas.Canvas(out_path, pagesize=(W, H))

    # Solid back/accent background.
    try:
        accent = HexColor(ACCENT)
    except Exception:
        accent = HexColor("#18181B")
    c.setFillColor(accent)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # Front cover panel — paste the EPUB cover image.
    trim_w_pt = TRIM_W * inch
    trim_h_pt = TRIM_H * inch
    bleed_pt = BLEED * inch
    flap_pt = HARDCOVER_FLAP * inch if hardcover else 0

    front_x = flap_pt + bleed_pt + trim_w_pt + spine
    front_y = bleed_pt
    if os.path.exists(COVER_IMG):
        try:
            img = ImageReader(COVER_IMG)
            c.drawImage(
                img,
                front_x - bleed_pt,
                front_y - bleed_pt,
                width=trim_w_pt + bleed_pt * 2,
                height=trim_h_pt + bleed_pt * 2,
                preserveAspectRatio=False,
                mask='auto',
            )
        except Exception:
            pass

    # Back cover — simple centered blurb.
    back_x = flap_pt + bleed_pt
    back_y = bleed_pt
    c.setFillColor(Color(1, 1, 1, alpha=0.92))
    c.setFont("Helvetica", 11)
    from reportlab.platypus import Paragraph, Frame
    from reportlab.lib.styles import ParagraphStyle
    style = ParagraphStyle(
        name='back',
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=Color(0.95, 0.95, 0.95, alpha=1),
    )
    para = Paragraph(BLURB.replace('\\n', '<br/>'), style)
    f = Frame(back_x + 0.6 * inch, back_y + 1.0 * inch,
              trim_w_pt - 1.2 * inch, trim_h_pt - 2.0 * inch,
              showBoundary=0)
    f.addFromList([para], c)

    # Spine — rotated title + author, centered along the spine strip.
    spine_x = flap_pt + bleed_pt + trim_w_pt
    spine_mid_x = spine_x + spine / 2
    spine_mid_y = bleed_pt + trim_h_pt / 2
    c.saveState()
    c.translate(spine_mid_x, spine_mid_y)
    c.rotate(-90)
    c.setFillColor(Color(0.98, 0.98, 0.98))
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(0, 4, TITLE[:60])
    c.setFont("Helvetica", 10)
    c.drawCentredString(0, -14, AUTHOR[:60])
    c.restoreState()

    c.showPage()
    c.save()

out_pb = "${SANDBOX_BUILD_DIR}/cover-wrap-paperback.pdf"
out_hc = "${SANDBOX_BUILD_DIR}/cover-wrap-hardcover.pdf"
draw_wrap(out_pb, ${spinePaperback.toFixed(4)}, False)
draw_wrap(out_hc, ${spineHardcover.toFixed(4)}, True)
print("OK", out_pb, os.path.getsize(out_pb), out_hc, os.path.getsize(out_hc))
`;
  const result = await sbx.runCode(py, { timeoutMs: COVER_WRAP_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');
  if (!stdout.startsWith('OK')) {
    const stderr = (result.logs?.stderr ?? []).join('\n').slice(0, 800);
    throw new Error(`Cover wrap generation failed: ${stderr || 'no stdout'}`);
  }
  return {
    paperbackPath: `${SANDBOX_BUILD_DIR}/cover-wrap-paperback.pdf`,
    hardcoverPath: `${SANDBOX_BUILD_DIR}/cover-wrap-hardcover.pdf`,
  };
}

/**
 * Generate the copyright certificate (single-page PDF). Watermarks the
 * user-claimed author + title + UTC timestamp + SHA-256 of the
 * concatenated proofed manuscript + a Berne-Convention-style disclaimer.
 *
 * Deliberately simple — not legal advice; the hash is what gives the
 * document timestamping value. QR points at the book's public URL (real
 * route in Slice 10; for now a placeholder).
 */
async function generateCopyrightCertificate(
  sbx: ComputeSandbox,
  opts: {
    title: string;
    author: string;
    manuscriptSha256: string;
    bookId: string;
    siteBaseUrl?: string;
  }
): Promise<string> {
  const siteBase = (opts.siteBaseUrl ?? 'https://mr8.app').replace(/\/$/, '');
  const publicUrl = `${siteBase}/books/${opts.bookId}/public`;
  const escape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  const py = `
import io, os, datetime
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
import qrcode

TITLE = """${escape(opts.title)}"""
AUTHOR = """${escape(opts.author) || 'Unknown Author'}"""
HASH = "${opts.manuscriptSha256}"
URL = "${publicUrl}"
OUT = "${SANDBOX_BUILD_DIR}/copyright-certificate.pdf"

W, H = LETTER
c = canvas.Canvas(OUT, pagesize=LETTER)

# Border.
c.setStrokeColor(HexColor("#18181B"))
c.setLineWidth(1.4)
c.rect(0.8 * inch, 0.8 * inch, W - 1.6 * inch, H - 1.6 * inch, stroke=1, fill=0)
c.setLineWidth(0.4)
c.rect(1.0 * inch, 1.0 * inch, W - 2.0 * inch, H - 2.0 * inch, stroke=1, fill=0)

# Header.
c.setFillColor(HexColor("#18181B"))
c.setFont("Helvetica-Bold", 22)
c.drawCentredString(W / 2, H - 1.6 * inch, "Certificate of Authorship")
c.setFont("Helvetica-Oblique", 11)
c.drawCentredString(W / 2, H - 1.95 * inch, "Manuscript record — produced with Mr8")

# Body fields.
c.setFont("Helvetica-Bold", 13)
c.drawString(1.4 * inch, H - 2.8 * inch, "Title")
c.setFont("Helvetica", 13)
c.drawString(2.4 * inch, H - 2.8 * inch, TITLE[:70])

c.setFont("Helvetica-Bold", 13)
c.drawString(1.4 * inch, H - 3.2 * inch, "Author")
c.setFont("Helvetica", 13)
c.drawString(2.4 * inch, H - 3.2 * inch, AUTHOR[:70])

c.setFont("Helvetica-Bold", 13)
c.drawString(1.4 * inch, H - 3.6 * inch, "Timestamp")
c.setFont("Helvetica", 13)
c.drawString(2.4 * inch, H - 3.6 * inch, datetime.datetime.utcnow().isoformat() + "Z")

c.setFont("Helvetica-Bold", 13)
c.drawString(1.4 * inch, H - 4.0 * inch, "SHA-256")
c.setFont("Courier", 10)
# Hash wraps onto two lines.
c.drawString(2.4 * inch, H - 4.0 * inch, HASH[:44])
c.drawString(2.4 * inch, H - 4.24 * inch, HASH[44:])

# Disclaimer.
c.setFont("Helvetica", 9)
c.setFillColor(Color(0.3, 0.3, 0.3))
disclaimer = (
    "Under the Berne Convention, copyright in an original literary work is secured "
    "automatically upon creation and fixation in a tangible medium. This certificate "
    "attests that the above-named author holds the referenced manuscript under their "
    "name at the timestamp shown. The SHA-256 hash fingerprints the exact text; any "
    "later modification will produce a different hash. This document is a record, "
    "not legal advice — jurisdiction-specific registration may still be advisable."
)
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
style = ParagraphStyle(
    name='disc', fontName='Helvetica', fontSize=9,
    leading=12, textColor=Color(0.32, 0.32, 0.32), alignment=0,
)
f = Frame(1.4 * inch, 1.6 * inch, W - 2.8 * inch, 2.4 * inch, showBoundary=0)
f.addFromList([Paragraph(disclaimer, style)], c)

# QR code — public URL.
try:
    qr_img = qrcode.make(URL)
    qr_path = "${SANDBOX_BUILD_DIR}/_qr_tmp.png"
    qr_img.save(qr_path)
    c.drawImage(qr_path, W - 2.4 * inch, 1.2 * inch, width=1.0 * inch, height=1.0 * inch)
    os.remove(qr_path)
except Exception:
    pass

c.setFont("Helvetica", 8)
c.setFillColor(Color(0.4, 0.4, 0.4))
c.drawString(1.4 * inch, 1.25 * inch, URL)

c.showPage()
c.save()
print("OK", OUT, os.path.getsize(OUT))
`;
  const result = await sbx.runCode(py, { timeoutMs: KIT_PDF_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');
  if (!stdout.startsWith('OK')) {
    const stderr = (result.logs?.stderr ?? []).join('\n').slice(0, 600);
    throw new Error(`Copyright certificate generation failed: ${stderr || 'no stdout'}`);
  }
  return `${SANDBOX_BUILD_DIR}/copyright-certificate.pdf`;
}

/**
 * Generate the KDP upload guide — a short, personalized walkthrough
 * written into a PDF. Uses reportlab's Paragraph flow for light markdown
 * (bold + bullet lists). Placeholders are substituted with the real
 * title / trim / page count so the guide is specific to the book.
 */
async function generateKdpUploadGuide(
  sbx: ComputeSandbox,
  opts: {
    title: string;
    author: string;
    trim: BookTrimSize;
    pageCount: number;
  }
): Promise<string> {
  const escape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  const py = `
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

TITLE = """${escape(opts.title)}"""
AUTHOR = """${escape(opts.author) || 'Unknown Author'}"""
TRIM = "${opts.trim}"
PAGES = ${opts.pageCount}
OUT = "${SANDBOX_BUILD_DIR}/kdp-upload-guide.pdf"

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=20, leading=24,
                    textColor=HexColor("#18181B"), spaceAfter=10)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=14, leading=18,
                    textColor=HexColor("#27272A"), spaceBefore=14, spaceAfter=6)
body = ParagraphStyle('body', parent=styles['BodyText'], fontSize=11, leading=15,
                      textColor=HexColor("#27272A"))
bullet = ParagraphStyle('bullet', parent=body, leftIndent=16, bulletIndent=4,
                        spaceBefore=2, spaceAfter=2)
tip = ParagraphStyle('tip', parent=body, fontSize=10, leading=14,
                     textColor=HexColor("#1D4ED8"), leftIndent=10,
                     borderPadding=(8, 8, 8, 8))

doc = SimpleDocTemplate(
    OUT, pagesize=LETTER,
    leftMargin=0.9 * inch, rightMargin=0.9 * inch,
    topMargin=1.0 * inch, bottomMargin=1.0 * inch,
    title="KDP Upload Guide — " + TITLE, author=AUTHOR,
)

story = []
story.append(Paragraph("KDP Upload Guide", h1))
story.append(Paragraph(
    "A 10-minute walkthrough for getting <b>%s</b> live on Amazon Kindle Direct Publishing." % TITLE,
    body,
))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Book: <b>%s</b> &middot; Author: <b>%s</b> &middot; Trim: <b>%s&quot;</b> &middot; Pages: <b>%d</b>"
    % (TITLE, AUTHOR, TRIM, PAGES),
    body,
))

story.append(Paragraph("1. Create a new KDP title", h2))
for step in [
    "Sign in at <font color='#1D4ED8'>kdp.amazon.com</font> and click <b>+ Create</b>.",
    "Choose <b>Paperback</b> first (easier to review). You can add the Kindle eBook and Hardcover afterwards.",
    "Language: <b>English</b> (or your manuscript's primary language).",
    "Enter the title exactly as it appears on your cover: <b>%s</b>." % TITLE,
]:
    story.append(Paragraph("&bull; " + step, bullet))

story.append(Paragraph("2. Book details", h2))
for step in [
    "Author: <b>%s</b>. Leave the contributors empty unless you have co-authors." % AUTHOR,
    "Description: paste the back-cover blurb (from your book.epub).",
    "Keywords: pick 7 — mix genre, audience, tone, setting, trope.",
    "Categories: two BISAC codes. Pick the most specific subcategories that still fit — niche ranks faster.",
]:
    story.append(Paragraph("&bull; " + step, bullet))

story.append(Paragraph("3. Print options", h2))
for step in [
    "Interior: <b>Black &amp; white</b> &middot; <b>Cream paper</b> (or white — your choice).",
    "Trim: <b>%s&quot;</b> (matches the PDF we generated)." % TRIM,
    "Bleed: <b>No bleed</b> (unless you have full-page images).",
    "Paperback cover finish: <b>Matte</b> (industry standard for literary; glossy if you prefer punch).",
]:
    story.append(Paragraph("&bull; " + step, bullet))

story.append(Paragraph("4. Upload files", h2))
for step in [
    "Manuscript: upload <b>book.pdf</b> from the Mr8 bundle.",
    "Cover: upload <b>cover-wrap-paperback.pdf</b>. KDP will check spine width against page count automatically.",
    "Click <b>Launch Previewer</b>. If the preview shows zero warnings, you're clear to submit.",
]:
    story.append(Paragraph("&bull; " + step, bullet))

story.append(Paragraph("5. Pricing and rights", h2))
for step in [
    "Territories: <b>All</b>.",
    "Royalty: <b>60%%</b> (paperback) &middot; <b>70%%</b> (Kindle if priced $2.99–$9.99).",
    "Minimum price is locked by KDP based on print cost — they show you the floor.",
    "Expanded distribution: enable if you want bookstores. Off by default (you get smaller royalty on those).",
]:
    story.append(Paragraph("&bull; " + step, bullet))

story.append(PageBreak())
story.append(Paragraph("After publication", h1))
story.append(Paragraph(
    "KDP typically reviews new titles within 72 hours. You'll get an email when the book goes live, "
    "and it becomes buyable on Amazon shortly after. To add the Kindle eBook, return to your KDP "
    "Bookshelf and click <b>+ Kindle eBook</b> on the same title — you can reuse the description, "
    "keywords, and categories, then upload <b>book.epub</b>.",
    body,
))
story.append(Spacer(1, 14))
story.append(Paragraph(
    "Save the <b>copyright-certificate.pdf</b> from your Mr8 bundle with your records. "
    "The SHA-256 hash it contains is a time-stamped fingerprint of this manuscript.",
    body,
))

doc.build(story)
print("OK", OUT, os.path.getsize(OUT))
`;
  const result = await sbx.runCode(py, { timeoutMs: KIT_PDF_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');
  if (!stdout.startsWith('OK')) {
    const stderr = (result.logs?.stderr ?? []).join('\n').slice(0, 600);
    throw new Error(`KDP guide generation failed: ${stderr || 'no stdout'}`);
  }
  return `${SANDBOX_BUILD_DIR}/kdp-upload-guide.pdf`;
}

/**
 * SHA-256 of the concatenated proofed manuscript — used as the copyright
 * certificate's time-stamp fingerprint. Stable across runs for the same
 * input text.
 */
function hashManuscript(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

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
    const { manuscriptMd, includedChapters } = await buildManuscript(sbx, book.chapters, {
      title: book.title,
      author: book.author ?? '',
      bio: book.bio,
      dedication: book.dedication,
      epigraph: book.epigraph,
      acknowledgements: book.acknowledgements,
      copyrightPageText: book.copyrightPageText,
    });
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

    // --- Step 9 + 10: cover wraps + kit PDFs (7.iii) ------------------------
    // These are best-effort — if either fails we still ship the PDF/EPUB/DOCX
    // we already built. A specific cover-wrap or kit failure surfaces via
    // `format.wrap_failed` / `format.kit_failed` events for UI transparency.

    const pdfArtifact = builtArtifacts.find((a) => a.kind === 'pdf');
    if (pdfArtifact) {
      try {
        writer.send('format.reading_page_count', {});
        const pageCount = await readPdfPageCount(sbx, `${SANDBOX_BUILD_DIR}/book.pdf`);
        writer.send('format.page_count_ready', { pageCount });

        writer.send('format.building_wraps', { pageCount });
        const accentHex = theme.previewPalette[2] ?? '#18181B';
        const wraps = await generateCoverWraps(sbx, {
          title: book.title,
          author: book.author ?? '',
          pageCount,
          trim: (book.production?.trimSize ?? theme.trimSize) as BookTrimSize,
          themeAccentHex: accentHex,
        });

        const pbArtifact = await mirrorArtifact(sbx, {
          userId: userIdStr,
          bookId: bookIdStr,
          sandboxPath: wraps.paperbackPath,
          artifactKind: 'cover-wrap-paperback',
          filename: 'cover-wrap-paperback.pdf',
        });
        builtArtifacts.push(pbArtifact);
        writer.send('format.ready', {
          kind: pbArtifact.kind,
          url: pbArtifact.url,
          sizeBytes: pbArtifact.sizeBytes,
        });

        const hcArtifact = await mirrorArtifact(sbx, {
          userId: userIdStr,
          bookId: bookIdStr,
          sandboxPath: wraps.hardcoverPath,
          artifactKind: 'cover-wrap-hardcover',
          filename: 'cover-wrap-hardcover.pdf',
        });
        builtArtifacts.push(hcArtifact);
        writer.send('format.ready', {
          kind: hcArtifact.kind,
          url: hcArtifact.url,
          sizeBytes: hcArtifact.sizeBytes,
        });
      } catch (err) {
        writer.send('format.wrap_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // --- Kit PDFs -----------------------------------------------------------
    try {
      writer.send('format.building_kit', {});
      const manuscriptSha = hashManuscript(manuscriptMd);
      const certPath = await generateCopyrightCertificate(sbx, {
        title: book.title,
        author: book.author ?? '',
        manuscriptSha256: manuscriptSha,
        bookId: bookIdStr,
        siteBaseUrl: process.env.FRONTEND_URL,
      });
      const certArtifact = await mirrorArtifact(sbx, {
        userId: userIdStr,
        bookId: bookIdStr,
        sandboxPath: certPath,
        artifactKind: 'copyright-cert',
        filename: 'copyright-certificate.pdf',
      });
      builtArtifacts.push(certArtifact);
      writer.send('format.ready', {
        kind: certArtifact.kind,
        url: certArtifact.url,
        sizeBytes: certArtifact.sizeBytes,
      });

      const guidePath = await generateKdpUploadGuide(sbx, {
        title: book.title,
        author: book.author ?? '',
        trim: (book.production?.trimSize ?? theme.trimSize) as BookTrimSize,
        pageCount: pdfArtifact ? await readPdfPageCount(sbx, `${SANDBOX_BUILD_DIR}/book.pdf`).catch(() => 0) : 0,
      });
      const guideArtifact = await mirrorArtifact(sbx, {
        userId: userIdStr,
        bookId: bookIdStr,
        sandboxPath: guidePath,
        artifactKind: 'kdp-guide',
        filename: 'kdp-upload-guide.pdf',
      });
      builtArtifacts.push(guideArtifact);
      writer.send('format.ready', {
        kind: guideArtifact.kind,
        url: guideArtifact.url,
        sizeBytes: guideArtifact.sizeBytes,
      });
    } catch (err) {
      writer.send('format.kit_failed', {
        message: err instanceof Error ? err.message : String(err),
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
