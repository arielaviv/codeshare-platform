import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { Book } from '../models/Book';
import { ApiError } from '../middleware/error.middleware';
import {
  selectCoverSchema,
  updateBookSchema,
  approveBookSchema,
  updateChapterProseSchema,
  replaceChaptersSchema,
} from '../utils/validators';
import { loadE2BConfig, connectComputeSandbox } from '../services/computer/e2b-client';
import mongoose from 'mongoose';

const router = Router();

/** GET /api/books/:id — owner-only book detail, including outline + coverVariants. */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Unauthorized', 401);
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError('Invalid book id', 400);
    }
    const book = await Book.findById(req.params.id).lean();
    if (!book) throw new ApiError('Book not found', 404);
    if (book.userId.toString() !== req.user._id.toString()) {
      throw new ApiError('Forbidden', 403);
    }
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/books/:id — update themeId, author, or title. Used by the Studio
 * toolbar: Theme dropdown, title input, author edit. Owner-scoped.
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Unauthorized', 401);
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError('Invalid book id', 400);
    }
    const validated = updateBookSchema.safeParse(req.body);
    if (!validated.success) {
      throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
    }
    const book = await Book.findById(req.params.id);
    if (!book) throw new ApiError('Book not found', 404);
    if (book.userId.toString() !== req.user._id.toString()) {
      throw new ApiError('Forbidden', 403);
    }
    const { themeId, author, title, bio, dedication, epigraph, acknowledgements, copyrightPageText } =
      validated.data;
    if (themeId) book.themeId = themeId;
    if (typeof author === 'string') book.author = author.trim().length > 0 ? author.trim() : undefined;
    if (typeof title === 'string' && title.trim().length > 0) book.title = title.trim();
    if (typeof bio === 'string') book.bio = bio.trim().length > 0 ? bio.trim() : undefined;
    if (typeof dedication === 'string') book.dedication = dedication.trim().length > 0 ? dedication.trim() : undefined;
    if (typeof epigraph === 'string') book.epigraph = epigraph.trim().length > 0 ? epigraph.trim() : undefined;
    if (typeof acknowledgements === 'string') book.acknowledgements = acknowledgements.trim().length > 0 ? acknowledgements.trim() : undefined;
    if (typeof copyrightPageText === 'string') book.copyrightPageText = copyrightPageText.trim().length > 0 ? copyrightPageText.trim() : undefined;
    await book.save();
    res.json({
      ok: true,
      book: {
        _id: book._id.toString(),
        title: book.title,
        author: book.author,
        themeId: book.themeId,
        bio: book.bio,
        dedication: book.dedication,
        epigraph: book.epigraph,
        acknowledgements: book.acknowledgements,
        copyrightPageText: book.copyrightPageText,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/books/:id/chapter/:n?mode=raw|edited|final
 *
 * Fetch a chapter's prose from the E2B sandbox. Used by the Reader's
 * Raw/Edited/Final toggle. `mode` falls back: final→edited→raw if the
 * requested path doesn't exist yet (so the user sees SOMETHING real
 * instead of an empty page).
 */
router.get('/:id/chapter/:n', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Unauthorized', 401);
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError('Invalid book id', 400);
    }
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new ApiError('Invalid chapter number', 400);
    }
    const rawMode = typeof req.query.mode === 'string' ? req.query.mode : 'raw';
    const mode = rawMode === 'edited' || rawMode === 'final' ? rawMode : 'raw';

    const book = await Book.findById(req.params.id);
    if (!book) throw new ApiError('Book not found', 404);
    if (book.userId.toString() !== req.user._id.toString()) {
      throw new ApiError('Forbidden', 403);
    }
    const ch = (book.chapters ?? []).find((c) => c.n === n);
    if (!ch) throw new ApiError(`Chapter ${n} not found`, 404);
    if (!book.sandboxId) throw new ApiError('Book has no sandbox', 404);

    // Fallback chain: requested mode → edited → raw.
    const candidates: Array<{ kind: 'final' | 'edited' | 'raw'; path?: string }> = [];
    if (mode === 'final') {
      candidates.push({ kind: 'final', path: ch.proofedPath });
      candidates.push({ kind: 'edited', path: ch.editedPath });
      candidates.push({ kind: 'raw', path: ch.draftPath });
    } else if (mode === 'edited') {
      candidates.push({ kind: 'edited', path: ch.editedPath });
      candidates.push({ kind: 'raw', path: ch.draftPath });
    } else {
      candidates.push({ kind: 'raw', path: ch.draftPath });
    }
    const chosen = candidates.find((c) => c.path);
    if (!chosen || !chosen.path) {
      throw new ApiError(`Chapter ${n} not yet drafted`, 404);
    }

    try {
      const config = loadE2BConfig();
      const sbx = await connectComputeSandbox(config, book.sandboxId);
      const content = await sbx.files.read(`/home/user/book/${chosen.path}`);
      await sbx.pause().catch(() => {});
      if (typeof content !== 'string') {
        throw new ApiError('Chapter file unreadable', 500);
      }
      res.json({
        n,
        mode: chosen.kind,
        requestedMode: mode,
        path: chosen.path,
        content,
        wordCount: ch.wordCount ?? content.trim().split(/\s+/).filter(Boolean).length,
      });
    } catch (sandboxErr) {
      const msg = sandboxErr instanceof Error ? sandboxErr.message : String(sandboxErr);
      throw new ApiError(`Failed to read chapter: ${msg}`, 500);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/books/:id/chapter/:n/prose — save manual edits to a chapter's
 * prose. Body: `{ text, variant: 'draft'|'edited'|'proofed' }`.
 *
 * Persists to `chapter.manualText[variant]` in Mongo (source of truth — edits
 * survive sandbox death). Best-effort also writes to the sandbox file at
 * `chapters/chNN.md` / `edited/chNN.md` / `proofed/chNN.md` so the Mr8
 * Computer panel stays in sync. The Formatter prefers `manualText` over
 * sandbox files during `buildManuscript`.
 */
router.patch(
  '/:id/chapter/:n/prose',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ApiError('Unauthorized', 401);
      if (!mongoose.isValidObjectId(req.params.id)) {
        throw new ApiError('Invalid book id', 400);
      }
      const n = parseInt(req.params.n, 10);
      if (!Number.isFinite(n) || n < 1) throw new ApiError('Invalid chapter number', 400);

      const validated = updateChapterProseSchema.safeParse(req.body);
      if (!validated.success) {
        throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
      }
      const { text, variant } = validated.data;

      const book = await Book.findById(req.params.id);
      if (!book) throw new ApiError('Book not found', 404);
      if (book.userId.toString() !== req.user._id.toString()) throw new ApiError('Forbidden', 403);

      const chapters = book.chapters ?? [];
      const chapter = chapters.find((c) => c.n === n);
      if (!chapter) throw new ApiError(`Chapter ${n} not found`, 404);

      chapter.manualText = chapter.manualText ?? {};
      chapter.manualText[variant] = text;

      // Recompute word count from the newest text in the variant chain.
      const latest = chapter.manualText.proofed ?? chapter.manualText.edited ?? chapter.manualText.draft ?? text;
      const wordCount = latest.trim().match(/\S+/g)?.length ?? 0;
      chapter.wordCount = wordCount;

      book.markModified('chapters');
      await book.save();

      // Best-effort sandbox write so the Mr8 Computer panel stays in sync.
      // Doesn't block the response — failure here is fine because Mongo is
      // the source of truth from this point on.
      if (book.sandboxId) {
        void (async () => {
          try {
            const config = loadE2BConfig();
            const sbx = await connectComputeSandbox(config, book.sandboxId as string);
            const paddedN = String(n).padStart(2, '0');
            const subdir =
              variant === 'proofed' ? 'proofed' : variant === 'edited' ? 'edited' : 'chapters';
            await sbx.commands.run(`mkdir -p /home/user/book/${subdir}`, { timeoutMs: 5_000 }).catch(() => {});
            await sbx.files.write(`/home/user/book/${subdir}/ch${paddedN}.md`, text);
            await sbx.pause().catch(() => {});
          } catch {
            // ignore
          }
        })();
      }

      res.json({
        ok: true,
        chapter: {
          n,
          variant,
          wordCount: chapter.wordCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/books/:id/chapters — replace the book's chapters array (reorder,
 * rename, insert, delete). Body: `{ chapters: IBookChapter[] }` where each
 * entry carries the new `n` in server-expected order.
 *
 * Any chapter number that existed before but is absent from the new list
 * gets archived: its sandbox files (if any) are moved to
 * `chapters/_archived/chNN_<ts>.md` so they're not lost silently. New
 * chapters default to `pending` status without paths. Existing chapters'
 * status / path pointers / manualText are preserved by `n` match.
 */
router.put(
  '/:id/chapters',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ApiError('Unauthorized', 401);
      if (!mongoose.isValidObjectId(req.params.id)) {
        throw new ApiError('Invalid book id', 400);
      }
      const validated = replaceChaptersSchema.safeParse(req.body);
      if (!validated.success) {
        throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
      }
      const book = await Book.findById(req.params.id);
      if (!book) throw new ApiError('Book not found', 404);
      if (book.userId.toString() !== req.user._id.toString()) throw new ApiError('Forbidden', 403);

      const oldByN = new Map<number, NonNullable<typeof book.chapters>[number]>();
      for (const c of book.chapters ?? []) oldByN.set(c.n, c);

      const newChapters = validated.data.chapters.map((c, idx) => {
        const prior = oldByN.get(c.n);
        return {
          n: idx + 1, // renumber sequentially in the server's authoritative order
          title: c.title,
          beat: c.beat,
          estimatedWords: c.estimatedWords,
          status: c.status ?? prior?.status ?? 'pending',
          draftPath: c.draftPath ?? prior?.draftPath,
          editedPath: c.editedPath ?? prior?.editedPath,
          proofedPath: c.proofedPath ?? prior?.proofedPath,
          wordCount: c.wordCount ?? prior?.wordCount,
          editingNotes: prior?.editingNotes,
          skippedChunkIdxs: prior?.skippedChunkIdxs,
          errorMessage: prior?.errorMessage,
          audioPath: prior?.audioPath,
          manualText: prior?.manualText,
        };
      });

      // Identify deleted chapters (old `n` not present in new set) and archive
      // their sandbox files so prose isn't silently lost.
      const retainedNs = new Set(validated.data.chapters.map((c) => c.n));
      const deleted = Array.from(oldByN.values()).filter((c) => !retainedNs.has(c.n));

      if (deleted.length > 0 && book.sandboxId) {
        void (async () => {
          try {
            const config = loadE2BConfig();
            const sbx = await connectComputeSandbox(config, book.sandboxId as string);
            const ts = Date.now();
            await sbx.commands.run(`mkdir -p /home/user/book/chapters/_archived`, { timeoutMs: 5_000 }).catch(() => {});
            for (const ch of deleted) {
              for (const p of [ch.draftPath, ch.editedPath, ch.proofedPath]) {
                if (!p) continue;
                await sbx.commands.run(
                  `mv /home/user/book/${p} /home/user/book/chapters/_archived/$(basename ${p} .md)_${ts}.md 2>/dev/null || true`,
                  { timeoutMs: 5_000 }
                ).catch(() => {});
              }
            }
            await sbx.pause().catch(() => {});
          } catch {
            // ignore
          }
        })();
      }

      book.chapters = newChapters;
      book.markModified('chapters');
      await book.save();

      res.json({
        ok: true,
        chapters: newChapters.map((c) => ({ n: c.n, title: c.title })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** PATCH /api/books/:id/cover — persist the user's selected cover idx. */
router.patch('/:id/cover', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Unauthorized', 401);
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError('Invalid book id', 400);
    }
    const validated = selectCoverSchema.safeParse(req.body);
    if (!validated.success) {
      throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
    }
    const book = await Book.findById(req.params.id);
    if (!book) throw new ApiError('Book not found', 404);
    if (book.userId.toString() !== req.user._id.toString()) {
      throw new ApiError('Forbidden', 403);
    }
    const { selectedCoverIdx } = validated.data;
    const exists = (book.coverVariants ?? []).some((v) => v.idx === selectedCoverIdx);
    if (!exists) {
      throw new ApiError(`No cover variant at idx ${selectedCoverIdx}`, 400);
    }
    book.selectedCoverIdx = selectedCoverIdx;
    await book.save();
    res.json({ ok: true, selectedCoverIdx });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/books/:id/approve — resolve a pending approval gate.
 *
 * Body: { approvalId, choice, meta? }
 *
 * Returns: { ok, nextStage, sseUrl, payload } — the frontend uses sseUrl +
 * payload to immediately open a fresh SSE that picks up the next stage.
 *
 * Only the frontend's approval card knows the gate semantics today; this
 * endpoint's job is to resolve the pending approval against Mongo + decide
 * the routing. The Producer state machine (Slice 5+) will consolidate this
 * logic; Slice 4b handles the two currently-meaningful gates inline.
 */
router.post('/:id/approve', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Unauthorized', 401);
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError('Invalid book id', 400);
    }
    const validated = approveBookSchema.safeParse(req.body);
    if (!validated.success) {
      throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
    }
    const book = await Book.findById(req.params.id);
    if (!book) throw new ApiError('Book not found', 404);
    if (book.userId.toString() !== req.user._id.toString()) {
      throw new ApiError('Forbidden', 403);
    }
    const { choice } = validated.data;

    // Slice 4b gates:
    //   voice-check: choice ∈ { 'continue', 'tighter', 'warmer' }
    //   (tighter/warmer = re-run voice-check with directive; continue = run
    //    remaining chapters.)
    // Other gates will be handled here as they land in later slices.
    if (choice === 'continue' || choice.toLowerCase().includes('works') || choice.toLowerCase().includes('continue')) {
      return res.json({
        ok: true,
        nextStage: 'remaining',
        sseUrl: '/api/ai/draft-book',
        payload: { bookId: book._id.toString(), stage: 'remaining' },
      });
    }
    if (choice.toLowerCase().includes('tighter')) {
      return res.json({
        ok: true,
        nextStage: 'voice-check',
        sseUrl: '/api/ai/draft-book',
        payload: {
          bookId: book._id.toString(),
          stage: 'voice-check',
          directive: 'Tighter prose. Less lyrical, shorter sentences, fewer adverbs. Preserve the core voice but trim 15% of connective tissue.',
        },
      });
    }
    if (choice.toLowerCase().includes('warmer')) {
      return res.json({
        ok: true,
        nextStage: 'voice-check',
        sseUrl: '/api/ai/draft-book',
        payload: {
          bookId: book._id.toString(),
          stage: 'voice-check',
          directive: 'Warmer voice. More inner life, more human dialogue, more concrete physical detail. Keep the plot identical.',
        },
      });
    }
    // Fallback — unknown choice, echo back so the frontend can decide.
    return res.json({
      ok: true,
      nextStage: null,
      sseUrl: null,
      payload: { bookId: book._id.toString(), echoedChoice: choice },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
