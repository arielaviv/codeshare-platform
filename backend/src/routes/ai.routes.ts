import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { aiRateLimiter } from '../middleware/rateLimit.middleware';
import { getCodeExplanation } from '../services/ai.service';
import { ApiError } from '../middleware/error.middleware';

const router = Router();

/**
 * @swagger
 * /api/ai/explain/{postId}:
 *   post:
 *     summary: Get AI explanation for a post's code
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI explanation
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/explain/:postId',
  authenticate,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const forceRefresh = req.query.refresh === 'true';

      const result = await getCodeExplanation(postId, forceRefresh);

      res.json({
        explanation: result.explanation,
        cached: result.cached,
      });
    } catch (error) {
      if (error instanceof Error) {
        next(new ApiError(error.message, 400));
      } else {
        next(error);
      }
    }
  }
);

export default router;
