import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { aiRateLimiter, chatRateLimiter, agentRateLimiter } from '../middleware/rateLimit.middleware';
import { getCodeExplanation } from '../services/ai.service';
import { chatWithTools } from '../services/ai-chat.service';
import { runCodeAgent } from '../services/code-agent.service';
import type { SSEWriter } from '../services/code-agent.service';
import { ApiError } from '../middleware/error.middleware';
import type { ChatMessage, AgentRequest } from '../types/chat';

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

/**
 * @swagger
 * /api/ai/agent:
 *   post:
 *     summary: Code agent with workspace tools (SSE stream)
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
 *               workspace:
 *                 type: object
 *                 description: Current workspace files (path -> content)
 *     responses:
 *       200:
 *         description: SSE stream of agent events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/agent',
  authenticate,
  agentRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messages, workspace } = req.body as AgentRequest;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new ApiError('Messages array is required', 400);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer: SSEWriter = {
        send(event, data) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      const { model } = req.body as { model?: string };
      await runCodeAgent(messages, workspace || {}, writer, model);
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof ApiError) {
          next(error);
        } else if (error instanceof Error) {
          next(new ApiError(error.message, 500));
        } else {
          next(error);
        }
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Agent failed' })}\n\n`);
        res.end();
      }
    }
  }
);

export default router;
