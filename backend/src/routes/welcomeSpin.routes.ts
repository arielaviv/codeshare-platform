import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  claimWelcomeBonus,
  getWelcomeSpinStatus,
} from '../services/welcome-spin.service';

const router = Router();

/**
 * @swagger
 * /api/welcome-spin/claim:
 *   post:
 *     summary: Claim the one-time welcome slot-spin bonus (idempotent)
 *     tags: [Welcome Spin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bonus claimed, returns staged spin outcomes + new balance
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Already claimed
 */
router.post('/claim', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await claimWelcomeBonus(req.user!._id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/welcome-spin/status:
 *   get:
 *     summary: Has the authenticated user claimed the welcome bonus yet?
 *     tags: [Welcome Spin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Claim state + current balance
 *       401:
 *         description: Unauthorized
 */
router.get('/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getWelcomeSpinStatus(req.user!._id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
