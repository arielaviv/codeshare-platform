import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { readProfile } from '../services/soul.service';

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

export default router;
