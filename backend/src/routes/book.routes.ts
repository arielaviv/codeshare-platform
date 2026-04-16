import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { Book } from '../models/Book';
import { ApiError } from '../middleware/error.middleware';
import { selectCoverSchema, updateBookSchema, approveBookSchema } from '../utils/validators';
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
    const { themeId, author, title } = validated.data;
    if (themeId) book.themeId = themeId;
    if (typeof author === 'string') book.author = author.trim().length > 0 ? author.trim() : undefined;
    if (typeof title === 'string' && title.trim().length > 0) book.title = title.trim();
    await book.save();
    res.json({
      ok: true,
      book: {
        _id: book._id.toString(),
        title: book.title,
        author: book.author,
        themeId: book.themeId,
      },
    });
  } catch (err) {
    next(err);
  }
});

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
