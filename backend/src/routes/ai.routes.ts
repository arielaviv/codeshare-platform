import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { aiRateLimiter, chatRateLimiter } from '../middleware/rateLimit.middleware';
import { getCodeExplanation } from '../services/ai.service';
import { chatWithTools } from '../services/ai-chat.service';
import { ApiError } from '../middleware/error.middleware';
import type { ChatMessage } from '../types/chat';

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

/**
 * @swagger
 * /api/ai/chat:
 *   post:
 *     summary: Chat with AI assistant (supports tool use for searching and analyzing posts)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI chat response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 toolsUsed:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       input:
 *                         type: object
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/chat',
  authenticate,
  chatRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messages } = req.body as { messages: ChatMessage[] };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new ApiError('Messages array is required', 400);
      }

      const result = await chatWithTools(messages);

      res.json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else if (error instanceof Error) {
        next(new ApiError(error.message, 500));
      } else {
        next(error);
      }
    }
  }
);

export default router;
