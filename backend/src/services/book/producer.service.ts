import mongoose from 'mongoose';
import { Book, type EditAggressiveness } from '../../models/Book';
import { runContinuityAudit } from './continuity-auditor.service';
import { runLineEdit } from './line-editor.service';
import { runCopyEdit } from './copy-editor.service';

/**
 * Producer — sequences the Polish pipeline (audit → line-edit → copy-edit).
 *
 * Slice 5 scope: just the three polish passes. Slices 6–9 will extend this
 * with copywriter / formatter / narrator / translator stages. The helper
 * stays small and stateless; each pass is responsible for its own status
 * transitions on `book.chapters[]` + SSE emissions.
 *
 * Error strategy: if a pass fails, halt — do NOT proceed to the next pass.
 * The user can retry the failed stage individually via its dedicated route.
 */

export interface PolishPipelineSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunPolishPipelineOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  aggressiveness: EditAggressiveness;
  directives?: string;
  sessionId?: string;
  /** Skip the audit pass and go straight to line + copy edit. */
  skipAudit?: boolean;
}

export async function runPolishPipeline(
  opts: RunPolishPipelineOptions,
  writer: PolishPipelineSSEWriter
): Promise<void> {
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

  writer.send('pipeline_started', {
    bookId: book._id.toString(),
    passes: opts.skipAudit ? ['line-edit', 'copy-edit'] : ['audit', 'line-edit', 'copy-edit'],
  });

  const start = Date.now();
  let haltedAt: string | null = null;

  // Intercept stage errors without ending the writer — the producer keeps the
  // SSE open across stages.
  const wrap = (stageName: string) =>
    ({
      send(event: string, data: unknown): void {
        if (event === 'error') {
          haltedAt = stageName;
        }
        writer.send(event, data);
      },
      end(): void {
        // no-op — the outer producer owns the writer lifecycle
      },
    }) as const;

  // ---- Pass 1: Continuity Audit ----
  if (!opts.skipAudit) {
    await runContinuityAudit(
      { bookId: opts.bookId, userId: opts.userId, sessionId: opts.sessionId },
      wrap('audit')
    );
    if (haltedAt) {
      writer.send('pipeline_halted', { pass: haltedAt, durationMs: Date.now() - start });
      writer.end();
      return;
    }
  }

  // ---- Pass 2: Line Edit ----
  await runLineEdit(
    {
      bookId: opts.bookId,
      userId: opts.userId,
      aggressiveness: opts.aggressiveness,
      directives: opts.directives,
      sessionId: opts.sessionId,
    },
    wrap('line-edit')
  );
  if (haltedAt) {
    writer.send('pipeline_halted', { pass: haltedAt, durationMs: Date.now() - start });
    writer.end();
    return;
  }

  // ---- Pass 3: Copy Edit ----
  await runCopyEdit(
    { bookId: opts.bookId, userId: opts.userId, sessionId: opts.sessionId },
    wrap('copy-edit')
  );
  if (haltedAt) {
    writer.send('pipeline_halted', { pass: haltedAt, durationMs: Date.now() - start });
    writer.end();
    return;
  }

  writer.send('pipeline_complete', {
    bookId: opts.bookId,
    durationMs: Date.now() - start,
  });
  writer.end();
}
