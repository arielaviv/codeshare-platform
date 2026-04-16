import type { IBook, IBookChapter, IBookChapterOutline } from '../../models/Book';

/**
 * Idempotently materialize `book.chapters[]` from `book.outline.chapters`.
 *
 * First call: maps every outline chapter to a pending `IBookChapter` entry.
 * Subsequent calls:
 *   - Preserve existing chapter state (status, draftPath, wordCount, etc.)
 *   - Add entries for NEW outline chapters if the outline grew
 *   - Refresh immutable fields (title, beat, estimatedWords) so outline edits
 *     propagate to the tracking layer
 *   - Sorts by chapter number ascending so the sidebar renders in order
 *
 * Returns true when the caller should `await book.save()` — i.e. we actually
 * mutated the array. Caller is responsible for persistence because many call
 * sites already have pending book.save() calls they can consolidate with.
 */
export function maybeInitChapters(book: IBook): boolean {
  const outlineChapters = book.outline?.chapters ?? [];
  if (outlineChapters.length === 0) return false;

  const existing = new Map<number, IBookChapter>();
  for (const ch of book.chapters ?? []) {
    existing.set(ch.n, ch);
  }

  let mutated = false;
  const next: IBookChapter[] = [];

  for (const o of outlineChapters) {
    const prior = existing.get(o.n);
    if (prior) {
      // Preserve pipeline state; refresh outline-sourced fields.
      const titleChanged = prior.title !== o.title;
      const beatChanged = prior.beat !== o.beat;
      const estChanged = prior.estimatedWords !== o.estimatedWords;
      if (titleChanged || beatChanged || estChanged) {
        prior.title = o.title;
        prior.beat = o.beat;
        prior.estimatedWords = o.estimatedWords;
        mutated = true;
      }
      next.push(prior);
    } else {
      // Brand-new chapter entry.
      next.push(materializeFromOutline(o));
      mutated = true;
    }
  }

  // Drop any chapters that no longer exist in the outline (outline shrank).
  const priorCount = (book.chapters ?? []).length;
  if (priorCount !== next.length) mutated = true;

  // Keep order ascending by n.
  next.sort((a, b) => a.n - b.n);

  if (mutated) {
    book.chapters = next;
    book.markModified('chapters');
  }
  return mutated;
}

function materializeFromOutline(o: IBookChapterOutline): IBookChapter {
  return {
    n: o.n,
    title: o.title,
    beat: o.beat,
    estimatedWords: o.estimatedWords,
    status: 'pending',
  };
}

/**
 * Reset a single chapter's pipeline state back to 'pending' — used when the
 * user triggers a regenerate. Leaves `n`, `title`, `beat`, `estimatedWords`
 * intact; clears draft/edited/proofed paths + audio + wordCount + notes.
 */
export function resetChapterForRegenerate(book: IBook, chapterN: number): boolean {
  if (!book.chapters) return false;
  const idx = book.chapters.findIndex((c) => c.n === chapterN);
  if (idx < 0) return false;
  const ch = book.chapters[idx];
  ch.status = 'pending';
  ch.draftPath = undefined;
  ch.editedPath = undefined;
  ch.proofedPath = undefined;
  ch.audioPath = undefined;
  ch.wordCount = undefined;
  ch.editingNotes = undefined;
  ch.errorMessage = undefined;
  book.markModified('chapters');
  return true;
}
