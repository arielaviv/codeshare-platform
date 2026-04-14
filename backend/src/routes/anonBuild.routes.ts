import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { anonBuildRateLimiter } from '../middleware/rateLimit.middleware';
import { ApiError } from '../middleware/error.middleware';
import { runAnonBuild, adoptAnonBuild } from '../services/anon-build.service';
import type { SSEWriter } from '../services/anon-build.service';

const router = Router();

/**
 * @swagger
 * /api/ai/anon-build:
 *   post:
 *     summary: Anonymous landing-page agent build (SSE, IP-rate-limited)
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 maxLength: 300
 *     responses:
 *       200:
 *         description: SSE stream of build events
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit reached
 */
router.post(
  '/anon-build',
  anonBuildRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      const trimmed = (prompt || '').trim();
      if (trimmed.length < 3) {
        throw new ApiError('Prompt must be at least 3 characters', 400);
      }
      if (trimmed.length > 300) {
        throw new ApiError('Prompt cannot exceed 300 characters', 400);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => {
        closed = true;
      });

      const writer: SSEWriter = {
        send(event, data) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      const fwd = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
      const ip = fwd || req.ip || 'unknown';

      await runAnonBuild({ prompt: trimmed, ip }, writer);
    } catch (error) {
      if (!res.headersSent) {
        next(error);
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Build failed' })}\n\n`
        );
        res.end();
      }
    }
  }
);

/**
 * @swagger
 * /api/ai/anon-build/{buildId}/adopt:
 *   post:
 *     summary: Claim an anonymous build into the authenticated user's account; also grants welcome bonus if unclaimed
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Adoption result with files + welcome bonus award
 *       404:
 *         description: Build not found or expired
 *       409:
 *         description: Build already claimed
 */
router.post(
  '/anon-build/:buildId/adopt',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await adoptAnonBuild(req.params.buildId, req.user!._id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
