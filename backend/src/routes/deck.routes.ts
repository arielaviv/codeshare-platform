import { Router, Request, Response, NextFunction } from 'express';
import { SlideDeck } from '../models/SlideDeck';
import { createDeckSchema, updateDeckSchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { checkAndAwardMilestone } from '../services/milestone.service';

const router = Router();

/**
 * @swagger
 * /api/decks:
 *   get:
 *     summary: Get the authenticated user's decks (paginated)
 *     tags: [Decks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of decks per page
 *     responses:
 *       200:
 *         description: List of user's decks
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [decks, total] = await Promise.all([
      SlideDeck.find({ userId: req.user!._id })
        .select('-slides')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      SlideDeck.countDocuments({ userId: req.user!._id }),
    ]);

    res.json({
      decks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + decks.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/decks/{id}:
 *   get:
 *     summary: Get a single deck (owner only, unless isPublic is true)
 *     tags: [Decks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deck details
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Deck not found
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deck = await SlideDeck.findById(req.params.id).populate(
      'userId',
      'username profileImage'
    );

    if (!deck) {
      throw new ApiError('Deck not found', 404);
    }

    const ownerId = (deck.userId as unknown as { _id: { toString(): string } })._id.toString();
    const isOwner = req.user ? ownerId === req.user._id.toString() : false;

    if (!isOwner && !deck.isPublic) {
      throw new ApiError('Not authorized to view this deck', 403);
    }

    res.json({ deck, isOwner });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/decks:
 *   post:
 *     summary: Create a new deck
 *     tags: [Decks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               theme:
 *                 type: object
 *               slides:
 *                 type: array
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Deck created
 *       400:
 *         description: Validation error
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createDeckSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(validation.error.errors[0].message, 400);
    }

    const deck = new SlideDeck({
      userId: req.user!._id,
      ...validation.data,
    });

    await deck.save();

    const prize = await checkAndAwardMilestone(req.user!._id, 'deck');

    res.status(201).json({
      message: 'Deck created successfully',
      deck,
      ...(prize ? { prize } : {}),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/decks/{id}:
 *   put:
 *     summary: Update a deck (owner only)
 *     tags: [Decks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deck updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Deck not found
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deck = await SlideDeck.findById(req.params.id);

    if (!deck) {
      throw new ApiError('Deck not found', 404);
    }

    if (deck.userId.toString() !== req.user!._id.toString()) {
      throw new ApiError('Not authorized to update this deck', 403);
    }

    const validation = updateDeckSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(validation.error.errors[0].message, 400);
    }

    const updates = validation.data;

    if (updates.title !== undefined) deck.title = updates.title;
    if (updates.description !== undefined) deck.description = updates.description;
    if (updates.theme !== undefined) deck.theme = updates.theme;
    if (updates.slides !== undefined) deck.slides = updates.slides;
    if (updates.isPublic !== undefined) deck.isPublic = updates.isPublic;
    if (updates.thumbnail !== undefined) deck.thumbnail = updates.thumbnail;

    await deck.save();

    res.json({
      message: 'Deck updated successfully',
      deck,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/decks/{id}:
 *   delete:
 *     summary: Delete a deck (owner only)
 *     tags: [Decks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deck deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Deck not found
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deck = await SlideDeck.findById(req.params.id);

    if (!deck) {
      throw new ApiError('Deck not found', 404);
    }

    if (deck.userId.toString() !== req.user!._id.toString()) {
      throw new ApiError('Not authorized to delete this deck', 403);
    }

    await SlideDeck.findByIdAndDelete(req.params.id);

    res.json({ message: 'Deck deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
