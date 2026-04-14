import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  aiRateLimiter,
  chatRateLimiter,
  agentRateLimiter,
  deckGenerationRateLimiter,
  intentClassifyRateLimiter,
  computerRateLimiter,
  researchRateLimiter,
} from '../middleware/rateLimit.middleware';
import { getCodeExplanation } from '../services/ai.service';
import { chatWithTools } from '../services/ai-chat.service';
import { runCodeAgent } from '../services/code-agent.service';
import type { SSEWriter } from '../services/code-agent.service';
import { generateDeck } from '../services/slide-agent.service';
import type { SlideAgentSSEWriter } from '../services/slide-agent.service';
import { classifyIntent } from '../services/intent-classifier.service';
import { runComputerAgent } from '../services/computer-agent.service';
import { createComputerSSEWriter } from '../services/computer/sse-writer';
import { runResearchAgent } from '../services/research/research-agent.service';
import { generateDeckSchema, classifyIntentSchema, acceptDeliverySchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import type { ChatMessage, AgentRequest } from '../types/chat';
import { debitForFeature } from '../services/wallet.service';
import { UsageEvent } from '../models/UsageEvent';
import mongoose from 'mongoose';

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
      await runCodeAgent(messages, workspace || {}, writer, model, req.user!._id);
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

/**
 * @swagger
 * /api/ai/generate-deck:
 *   post:
 *     summary: Generate an AI slide deck (SSE stream)
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
 *               - topic
 *               - slideCount
 *             properties:
 *               topic:
 *                 type: string
 *               slideCount:
 *                 type: integer
 *                 minimum: 3
 *                 maximum: 20
 *               style:
 *                 type: string
 *                 enum: [professional, casual, academic]
 *               templateId:
 *                 type: string
 *     responses:
 *       200:
 *         description: SSE stream of generation events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/generate-deck',
  authenticate,
  deckGenerationRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = generateDeckSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ApiError(validation.error.errors[0].message, 400);
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

      const writer: SlideAgentSSEWriter = {
        send(event, data) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      await generateDeck(
        { ...validation.data, userId: req.user!._id },
        writer
      );
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
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Deck generation failed' })}\n\n`
        );
        res.end();
      }
    }
  }
);

/**
 * @swagger
 * /api/ai/classify-intent:
 *   post:
 *     summary: Classify a user prompt into deck / code-app / code-explain
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
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Classified intent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intent:
 *                   type: string
 *                   enum: [deck, code-app, code-explain]
 *                 confidence:
 *                   type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/classify-intent',
  authenticate,
  intentClassifyRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = classifyIntentSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ApiError(validation.error.errors[0].message, 400);
      }

      const result = await classifyIntent(validation.data.prompt, req.user!._id);
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
 * /api/ai/computer:
 *   post:
 *     summary: Mr8 Computer agent — browser + Python sandbox (SSE stream)
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
 *               model:
 *                 type: string
 *     responses:
 *       200:
 *         description: SSE stream — code-execution, browser-*, tool_call, tool_result, text_delta, done, error
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       429:
 *         description: Rate limit exceeded (5 / hour)
 */
router.post(
  '/computer',
  authenticate,
  computerRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messages, workspace, model } = req.body as AgentRequest & { model?: string };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new ApiError('Messages array is required', 400);
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      const e2bKey = process.env.E2B_API_KEY;
      if (!apiKey) throw new ApiError('ANTHROPIC_API_KEY not configured', 500);
      if (!e2bKey) throw new ApiError('E2B_API_KEY not configured', 500);

      const userId = req.user?._id?.toString();
      if (!userId) throw new ApiError('Authenticated user required', 401);

      const sse = createComputerSSEWriter(res);
      await runComputerAgent({
        messages,
        workspace: workspace ?? {},
        userId,
        model,
        sse,
        apiKey,
      });
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof ApiError) next(error);
        else if (error instanceof Error) next(new ApiError(error.message, 500));
        else next(error);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Computer agent failed' })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * @swagger
 * /api/ai/research:
 *   post:
 *     summary: Research agent — browser-only quick web research (SSE stream)
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
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: SSE stream that ends with a research_brief event carrying the ResearchBrief JSON.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       429:
 *         description: Rate limit exceeded (10 / hour)
 */
router.post(
  '/research',
  authenticate,
  researchRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.body as { query?: string };
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new ApiError('query is required', 400);
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      const e2bKey = process.env.E2B_API_KEY;
      if (!apiKey) throw new ApiError('ANTHROPIC_API_KEY not configured', 500);
      if (!e2bKey) throw new ApiError('E2B_API_KEY not configured', 500);

      const userId = req.user?._id?.toString();
      if (!userId) throw new ApiError('Authenticated user required', 401);

      const sse = createComputerSSEWriter(res);
      try {
        const brief = await runResearchAgent(query, { userId, sse, apiKey });
        res.write(`event: research_brief\ndata: ${JSON.stringify(brief)}\n\n`);
        sse.send('done', { iterations: 0, durationMs: brief.durationMs });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sse.send('error', { message });
      } finally {
        sse.end();
      }
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof ApiError) next(error);
        else if (error instanceof Error) next(new ApiError(error.message, 500));
        else next(error);
      } else {
        res.end();
      }
    }
  }
);

/**
 * @swagger
 * /api/ai/accept-delivery:
 *   post:
 *     summary: Accept a delivered build and debit the wallet for the plan price
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId, priceCents]
 *             properties:
 *               planId:
 *                 type: string
 *               priceCents:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Delivery accepted and wallet debited
 *       400:
 *         description: Validation error
 *       402:
 *         description: Insufficient wallet balance
 */
router.post(
  '/accept-delivery',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = acceptDeliverySchema.safeParse(req.body);
      if (!validated.success) {
        throw new ApiError(validated.error.errors[0]?.message ?? 'Invalid input', 400);
      }
      if (!req.user) {
        throw new ApiError('Authentication required', 401);
      }

      const { planId, priceCents } = validated.data;
      const userId = req.user._id;
      const debit = await debitForFeature(userId, priceCents, planId);

      if (!debit.ok) {
        throw new ApiError(debit.reason ?? 'Insufficient balance', 402);
      }

      try {
        await UsageEvent.create({
          userId,
          feature: 'delivery-verify',
          modelName: 'n/a',
          costCents: priceCents,
          deliveryStatus: 'delivered',
        });
      } catch {
        // best-effort usage tracking
      }

      res.json({
        ok: true,
        planId,
        priceCents,
        newBalanceCents: debit.newBalanceCents,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
