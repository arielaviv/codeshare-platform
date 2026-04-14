import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/error.middleware';
import { Wallet } from '../models/Wallet';
import { topUp } from '../services/wallet.service';

const router = Router();

const MAX_TOPUP_CENTS = 10000;

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     summary: Get the authenticated user's wallet balance + recent transactions
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance + last 50 transactions
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      res.json({ balanceCents: 0, transactions: [] });
      return;
    }
    const recent = [...wallet.transactions]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50)
      .map((t) => ({
        id: t._id.toString(),
        kind: t.kind,
        amountCents: t.amountCents,
        featureId: t.featureId,
        reason: t.reason,
        createdAt: t.createdAt,
      }));
    res.json({ balanceCents: wallet.balanceCents, transactions: recent });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/wallet/topup:
 *   post:
 *     summary: Mock top-up — adds amountCents to balance without a real payment processor
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amountCents:
 *                 type: integer
 *                 description: Positive integer amount to credit (max 10000 = $100)
 *     responses:
 *       200:
 *         description: New balance returned
 *       400:
 *         description: Invalid amount
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/topup',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amountCents } = req.body as { amountCents?: unknown };
      if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
        throw new ApiError('amountCents must be an integer', 400);
      }
      if (amountCents <= 0) {
        throw new ApiError('amountCents must be positive', 400);
      }
      if (amountCents > MAX_TOPUP_CENTS) {
        throw new ApiError(`amountCents exceeds max of ${MAX_TOPUP_CENTS}`, 400);
      }

      const result = await topUp(req.user!._id, amountCents);
      if (!result.ok) {
        throw new ApiError(result.reason || 'top-up failed', 400);
      }
      res.json({ balanceCents: result.newBalanceCents });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
