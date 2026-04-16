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
  bookGenerationRateLimiter,
} from '../middleware/rateLimit.middleware';
import { getCodeExplanation } from '../services/ai.service';
import { chatWithTools } from '../services/ai-chat.service';
import { runCodeAgent } from '../services/code-agent.service';
import type { SSEWriter } from '../services/code-agent.service';
import { generateDeck } from '../services/slide-agent.service';
import type { SlideAgentSSEWriter } from '../services/slide-agent.service';
import { generateSpreadsheet } from '../services/spreadsheet.generation.service';
import { generateAudio } from '../services/audio.generation.service';
import { generateVideo } from '../services/video.generation.service';
import { generateVisualization } from '../services/visualization.generation.service';
import type { ChartKind } from '../services/visualization.generation.service';
import { classifyIntent } from '../services/intent-classifier.service';
import { runComputerAgent } from '../services/computer-agent.service';
import { createComputerSSEWriter } from '../services/computer/sse-writer';
import type { ComputerSSEWriter } from '../services/computer/sse-writer';
import { runResearchAgent } from '../services/research/research-agent.service';
import { generateDeckSchema, classifyIntentSchema, acceptDeliverySchema, generateBookSchema } from '../utils/validators';
import { generateBook } from '../services/book-agent.service';
import type { BookAgentSSEWriter } from '../services/book-agent.service';
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

      const { model, chatOnly } = req.body as { model?: string; chatOnly?: boolean };
      await runCodeAgent(messages, workspace || {}, writer, model, req.user!._id, { chatOnly });
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

      // Part 3: inline browser research (opt-out via skipResearch).
      // Research events get prefixed with `research_` on the wire so
      // the existing deck client keeps working; new clients route them
      // into the Mr8 Computer timeline.
      let researchBrief = validation.data.researchBrief;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const e2bKey = process.env.E2B_API_KEY;
      const shouldResearch =
        !validation.data.skipResearch &&
        !researchBrief &&
        Boolean(anthropicKey) &&
        Boolean(e2bKey);

      if (shouldResearch) {
        writer.send('deck_phase', { phase: 'researching' });
        const researchAdapter = {
          send(event: string, data: unknown) {
            if (closed) return;
            res.write(`event: research_${event}\ndata: ${JSON.stringify(data)}\n\n`);
          },
          end() {
            /* don't close — the deck stream continues */
          },
        } as unknown as ComputerSSEWriter;
        try {
          const brief = await runResearchAgent(validation.data.topic, {
            userId: req.user!._id.toString(),
            sse: researchAdapter,
            apiKey: anthropicKey!,
          });
          researchBrief = brief;
          writer.send('research_brief_ready', brief);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writer.send('research_failed', { message });
          // Keep going — slides can still be generated without research.
        }
        writer.send('deck_phase', { phase: 'drafting' });
      }

      await generateDeck(
        {
          ...validation.data,
          researchBrief,
          userId: req.user!._id,
        },
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

/**
 * Phase 4G — generate_spreadsheet SSE endpoint.
 * Streams sheet_started → sheet_meta × N → sheet_row × M → sheet_completed.
 */
router.post(
  '/generate-spreadsheet',
  authenticate,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { topic, sheetCount, style, sessionId } = (req.body ?? {}) as {
        topic?: string;
        sheetCount?: number;
        style?: 'simple' | 'detailed';
        sessionId?: string;
      };
      if (!topic || topic.trim().length === 0) {
        res.status(400).json({ message: 'topic is required' });
        return;
      }
      if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writer = {
        send(event: string, data: unknown) {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          res.end();
        },
      };

      try {
        await generateSpreadsheet({ topic, sheetCount, style, sessionId }, req.user._id, writer);
      } catch (innerErr) {
        // Headers already flushed — surface the failure via SSE, never via
        // next(err) which would try to set headers again.
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Spreadsheet generation crashed: ${message}` });
          writer.end();
        } catch { /* socket already closed */ }
        console.error('[spreadsheet] crashed after headers flushed', innerErr);
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Phase 9E — generate_audio SSE endpoint (ElevenLabs TTS).
 * Streams audio_started → script_drafted → tts_generating → audio_ready.
 */
router.post(
  '/generate-audio',
  authenticate,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, scriptText, voiceId, sessionId, kind, sfxDurationSec, musicLengthMs } = (req.body ?? {}) as {
        prompt?: string;
        scriptText?: string;
        voiceId?: string;
        sessionId?: string;
        kind?: 'tts' | 'sfx' | 'music';
        sfxDurationSec?: number;
        musicLengthMs?: number;
      };
      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ message: 'prompt is required' });
        return;
      }
      if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writer = {
        send(event: string, data: unknown) {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          res.end();
        },
      };

      // Fall back to the user's saved voice (if any) when the request
      // didn't specify one explicitly. Best-effort — never block audio gen.
      let effectiveVoiceId = voiceId;
      if (!effectiveVoiceId) {
        try {
          const { SoulProfile } = await import('../models/SoulProfile');
          const profile = await SoulProfile.findOne({ userId: req.user._id }).lean();
          effectiveVoiceId = profile?.preferences?.defaultVoiceId ?? undefined;
        } catch (lookupErr) {
          console.warn('[audio] voice lookup failed, using default', lookupErr);
        }
      }

      await generateAudio(
        { prompt, scriptText, voiceId: effectiveVoiceId, sessionId, kind, sfxDurationSec, musicLengthMs },
        req.user._id,
        writer
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Phase 9F — generate_video SSE endpoint (Runway Gen-3 Turbo).
 * Streams video_started → prompt_refined → runway_queued →
 * runway_progress × N → video_ready | video_failed.
 */
router.post(
  '/generate-video',
  authenticate,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, durationSec, sessionId } = (req.body ?? {}) as {
        prompt?: string;
        durationSec?: 5 | 10;
        sessionId?: string;
      };
      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ message: 'prompt is required' });
        return;
      }
      if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writer = {
        send(event: string, data: unknown) {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          res.end();
        },
      };

      await generateVideo({ prompt, durationSec, sessionId }, req.user._id, writer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mr8 Book — generate-book SSE endpoint (outline stage for Slice 1).
 * Streams book_started → sandbox_ready → book_created → outline_generating
 *         → file_written → outline_ready → book_complete.
 */
router.post(
  '/generate-book',
  authenticate,
  bookGenerationRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = generateBookSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ApiError(validation.error.errors[0].message, 400);
      }
      if (!req.user) {
        throw new ApiError('Unauthorized', 401);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer: BookAgentSSEWriter = {
        send(event, data) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await generateBook(
          {
            prompt: validation.data.prompt,
            targetWords: validation.data.targetWords,
            sessionId: validation.data.sessionId,
            userId: req.user._id,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Book generation crashed: ${message}` });
          writer.end();
        } catch { /* socket already closed */ }
        console.error('[book] crashed after headers flushed', innerErr);
      }
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof ApiError) next(err);
        else if (err instanceof Error) next(new ApiError(err.message, 500));
        else next(err);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Book generation failed' })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * Phase 9C — generate_visualization SSE endpoint (Python-in-E2B chart).
 * Streams viz_started → viz_python_drafted → code-execution-* → viz_chart_ready.
 */
router.post(
  '/generate-visualization',
  authenticate,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, preferredCharts, sessionId } = (req.body ?? {}) as {
        prompt?: string;
        preferredCharts?: ChartKind[];
        sessionId?: string;
      };
      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ message: 'prompt is required' });
        return;
      }
      if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writer = {
        send(event: string, data: unknown) {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          res.end();
        },
      };

      await generateVisualization({ prompt, preferredCharts, sessionId }, req.user._id, writer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Phase 5 / 8 — /api/ai/tool
 * Invoked by FollowUpsCard when a suggestion has payload { kind: 'trigger_tool' }.
 * Runs a commerce tool out-of-band (outside of an agent stream). Phase 8 will
 * flesh out the individual tools; for now this accepts the request and echoes
 * a stub ack so the frontend doesn't 404.
 */
router.post('/tool', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tool, input } = (req.body ?? {}) as { tool?: string; input?: unknown };
    if (!tool) {
      res.status(400).json({ message: 'tool name required' });
      return;
    }
    // TODO Phase 8: dispatch to the commerce tool surface
    // (propose_feature, offer_bundle, trigger_slot_spin, give_free_powerup,
    //  threshold_unlock, rescue_churn, present_options).
    res.json({ ok: true, tool, acknowledged: true, input });
  } catch (err) {
    next(err);
  }
});

export default router;
