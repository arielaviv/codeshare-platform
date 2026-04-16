import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';

import { Book } from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { loadE2BConfig, connectComputeSandbox } from '../computer/e2b-client';
import { upsertSession } from '../computer/e2b-session-store';
import { readBinaryFromSandbox } from './sandbox-io';

/**
 * Bundler — Slice 7.iii.
 *
 * Runs after the Formatter has produced PDF / EPUB / DOCX / cover wraps /
 * kit PDFs inside the user's E2B sandbox. Zips everything into
 * `Mr8-Book-<slug>-<YYYYMMDD>.zip`, mirrors the zip to
 * `/uploads/books/<userId>/<bookId>/bundle/<filename>`, and flips the book
 * to `status: 'done'` with `bundleUrl` populated.
 *
 * Streams `bundle.progress { pct }` every ~10%, a terminal `bundle_ready
 * { bundleUrl, sizeBytes }`, and `stage_complete { stage: 'export' }`.
 */

export interface BundlerSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunBundleBookOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  sessionId?: string;
}

const SANDBOX_BOOK_DIR = '/home/user/book';
const SANDBOX_BUILD_DIR = `${SANDBOX_BOOK_DIR}/build`;
const SANDBOX_BUNDLE_DIR = `${SANDBOX_BOOK_DIR}/bundle`;

const ZIP_TIMEOUT_MS = 120_000;

const LOCAL_UPLOADS_BASE = path.join(__dirname, '..', '..', '..', 'uploads', 'books');

/**
 * URL-safe slug for the zip filename. Keeps ASCII letters/digits, drops
 * accents, collapses runs of other characters to `-`.
 */
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'book';
}

function yyyymmddUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Zip the sandbox's `/home/user/book/build/` directory (plus later audio +
 * translations) into a single archive. Uses Python's stdlib zipfile so we
 * avoid an extra apt package. Reports progress via stdout lines we parse
 * back into SSE events.
 */
async function zipInsideSandbox(
  sbx: ComputeSandbox,
  opts: { zipSandboxPath: string },
  writer: BundlerSSEWriter
): Promise<{ sizeBytes: number; entries: number }> {
  const py = `
import os, zipfile, sys

ROOT = "${SANDBOX_BOOK_DIR}"
OUT = "${opts.zipSandboxPath}"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# Source subdirectories, in the order they appear in the zip.
SUB_DIRS = [
    ("build", "."),
    ("audio", "audio"),
    ("translations", "translations"),
]

# Collect every file to include up-front so we can report accurate progress.
entries = []
for src_sub, zip_sub in SUB_DIRS:
    src_path = os.path.join(ROOT, src_sub)
    if not os.path.isdir(src_path):
        continue
    for base, _, files in os.walk(src_path):
        for f in files:
            if f.startswith('.'):
                continue
            abs_path = os.path.join(base, f)
            rel_from_src = os.path.relpath(abs_path, src_path)
            arcname = rel_from_src if zip_sub == '.' else os.path.join(zip_sub, rel_from_src)
            entries.append((abs_path, arcname))

total = len(entries)
print("TOTAL", total, flush=True)

last_pct = -1
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    for i, (abs_path, arcname) in enumerate(entries, 1):
        zf.write(abs_path, arcname)
        pct = int(i * 100 / max(1, total))
        if pct // 10 != last_pct // 10:
            last_pct = pct
            print("PROGRESS", pct, flush=True)

size = os.path.getsize(OUT)
print("DONE", size, total, flush=True)
`;

  const result = await sbx.runCode(py, { timeoutMs: ZIP_TIMEOUT_MS });
  const stdout = (result.logs?.stdout ?? []).join('\n');

  // Parse progress lines into SSE events.
  for (const line of stdout.split('\n')) {
    const prog = /^PROGRESS\s+(\d+)/.exec(line);
    if (prog) {
      writer.send('bundle.progress', { pct: Number.parseInt(prog[1], 10) });
    }
  }

  const done = /DONE\s+(\d+)\s+(\d+)/.exec(stdout);
  if (!done) {
    const stderr = (result.logs?.stderr ?? []).join('\n').slice(0, 800);
    throw new Error(`Zip failed: ${stderr || stdout.slice(0, 400) || 'no stdout'}`);
  }
  return {
    sizeBytes: Number.parseInt(done[1], 10),
    entries: Number.parseInt(done[2], 10),
  };
}

export async function bundleBook(
  opts: RunBundleBookOptions,
  writer: BundlerSSEWriter
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
  if (!book.sandboxId) {
    writer.send('error', { message: 'Book has no sandbox — format first' });
    writer.end();
    return;
  }
  if (!book.artifacts || book.artifacts.length === 0) {
    writer.send('error', {
      message: 'No artifacts to bundle — run the Formatter before exporting',
    });
    writer.end();
    return;
  }

  const userIdStr = opts.userId.toString();
  const bookIdStr = book._id.toString();

  writer.send('stage_started', { stage: 'export' });
  book.status = 'bundling';
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

  const filename = `Mr8-Book-${slugify(book.title)}-${yyyymmddUtc(new Date())}.zip`;
  const zipSandboxPath = `${SANDBOX_BUNDLE_DIR}/${filename}`;

  try {
    await sbx.commands.run(`mkdir -p ${SANDBOX_BUNDLE_DIR}`, { timeoutMs: 5_000 }).catch(() => {});

    writer.send('bundle.zipping', { filename });
    const { sizeBytes, entries } = await zipInsideSandbox(
      sbx,
      { zipSandboxPath },
      writer
    );
    writer.send('bundle.zip_ready', { sizeBytes, entries });

    // --- Mirror to disk ------------------------------------------------------
    const bytes = await readBinaryFromSandbox(sbx, zipSandboxPath);
    const localDir = path.join(LOCAL_UPLOADS_BASE, userIdStr, bookIdStr, 'bundle');
    fs.mkdirSync(localDir, { recursive: true });
    const localFile = path.join(localDir, filename);
    fs.writeFileSync(localFile, bytes);
    const bundleUrl = `/uploads/books/${userIdStr}/${bookIdStr}/bundle/${filename}`;

    // --- Persist on the book ------------------------------------------------
    const now = new Date();
    book.bundleUrl = bundleUrl;
    book.publishedBundleAt = now;
    book.status = 'done';

    // Track the bundle itself as an artifact too, for the Downloads view.
    const artifacts = book.artifacts ?? [];
    const withoutBundle = artifacts.filter((a) => a.kind !== 'bundle-zip');
    book.artifacts = [
      ...withoutBundle,
      {
        kind: 'bundle-zip',
        sandboxPath: `bundle/${filename}`,
        url: bundleUrl,
        sizeBytes: bytes.byteLength,
        builtAt: now,
        lang: 'en',
      },
    ];
    book.markModified('artifacts');
    await book.save();

    try {
      await UsageEvent.create({
        userId: opts.userId,
        sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
        feature: 'book-bundle',
        modelName: 'zipfile',
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      });
    } catch {
      // best-effort
    }

    writer.send('bundle_ready', {
      bundleUrl,
      sizeBytes: bytes.byteLength,
      filename,
      entries,
    });
    writer.send('stage_complete', {
      stage: 'export',
      status: 'done',
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Bundler failed: ${message}` });
    try {
      book.status = 'formatting';
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
