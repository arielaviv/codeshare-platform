import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';

/**
 * Binary I/O helpers for the Formatter / Bundler.
 *
 * The shared `python-handler` caps output files at 10MB, which is fine for
 * most tool calls but will block a full book bundle (PDF + EPUB + DOCX +
 * cover wraps + audiobook + kit PDFs) from being extracted from the
 * sandbox. These helpers call `sbx.files.read(path, { format: 'bytes' })`
 * directly, bypassing the shared handler's cap, and enforce our own
 * server-side ceiling of 100MB per artifact as a sanity bound.
 */

/** Per-artifact ceiling. Generous enough for any realistic book + audiobook. */
export const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;

export class ArtifactTooLargeError extends Error {
  constructor(public readonly sandboxPath: string, public readonly sizeBytes: number) {
    super(
      `Artifact ${sandboxPath} (${sizeBytes} bytes) exceeds ${MAX_ARTIFACT_BYTES}-byte cap`
    );
    this.name = 'ArtifactTooLargeError';
  }
}

/**
 * Read a file from the sandbox as raw bytes, returning a Node `Buffer`.
 * Throws `ArtifactTooLargeError` if the file exceeds `MAX_ARTIFACT_BYTES`.
 *
 * Accepts either an absolute sandbox path (`/home/user/book/build/book.pdf`)
 * or any path the sandbox's filesystem will resolve.
 */
export async function readBinaryFromSandbox(
  sbx: ComputeSandbox,
  sandboxPath: string
): Promise<Buffer> {
  const raw = await sbx.files.read(sandboxPath, { format: 'bytes' });
  const buf = Buffer.from(raw);
  if (buf.byteLength > MAX_ARTIFACT_BYTES) {
    throw new ArtifactTooLargeError(sandboxPath, buf.byteLength);
  }
  return buf;
}

/**
 * Convenience: returns the byte size of a sandbox file via `stat`, without
 * actually reading it. Useful for fail-fast size checks before a potentially
 * expensive read. Returns `null` if the file doesn't exist.
 */
export async function getSandboxFileSize(
  sbx: ComputeSandbox,
  sandboxPath: string
): Promise<number | null> {
  const quoted = sandboxPath.replace(/'/g, "'\\''");
  const result = await sbx.commands.run(
    `stat --printf='%s' '${quoted}' 2>/dev/null || echo MISSING`,
    { timeoutMs: 5_000 }
  );
  const out = result.stdout.trim();
  if (out === 'MISSING' || out.length === 0) return null;
  const n = Number.parseInt(out, 10);
  return Number.isFinite(n) ? n : null;
}
