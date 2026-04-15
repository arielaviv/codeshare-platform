import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { readProfile } from '../services/soul.service';
import { SoulProfile } from '../models/SoulProfile';

const router = Router();

/**
 * @swagger
 * /api/soul/me:
 *   get:
 *     summary: Return the authenticated user's SOUL profile (transparency stub)
 *     tags: [Soul Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current profile as JSON
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await readProfile(req.user!._id);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

// Phase 6: PATCH personalization fields from the PersonalizationModal.
const patchSchema = z.object({
  nickname: z.string().max(60).optional().nullable(),
  occupation: z.string().max(80).optional().nullable(),
  aboutYou: z.string().max(2000).optional().nullable(),
  customInstructions: z.string().max(3000).optional().nullable(),
});

router.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten() });
      return;
    }
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === null) {
        update[k] = undefined;
      } else if (v !== undefined) {
        update[k] = v;
      }
    }
    const profile = await SoulProfile.findOneAndUpdate(
      { userId: req.user!._id },
      { $set: update },
      { new: true, upsert: true }
    );
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

// Phase 5: record a rating signal (TaskCompletedCard stars).
const ratingSchema = z.object({
  value: z.number().int().min(1).max(5),
});

router.post('/signals/rating', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid rating' });
      return;
    }
    await SoulProfile.findOneAndUpdate(
      { userId: req.user!._id },
      {
        $push: {
          wtpSignals: {
            kind: 'feature-accepted',
            priceCents: 0,
            context: `rating=${parsed.data.value}`,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true }
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
