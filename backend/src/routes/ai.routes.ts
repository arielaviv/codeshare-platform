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
  coverGenerationRateLimiter,
  chapterDraftingRateLimiter,
  bookAuditRateLimiter,
  bookFormatRateLimiter,
  bookBundleRateLimiter,
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
import type { ResearchBrief } from '../services/research/research-brief.types';
import {
  generateDeckSchema,
  classifyIntentSchema,
  acceptDeliverySchema,
  generateBookSchema,
  generateBookCoverSchema,
  planBookSchema,
  draftBookSchema,
  polishBookSchema,
  auditBookSchema,
  reEditChapterSchema,
  formatBookSchema,
  bundleBookSchema,
} from '../utils/validators';
import { generateBook } from '../services/book-agent.service';
import type { BookAgentSSEWriter } from '../services/book-agent.service';
import { generateBookCovers } from '../services/book-cover.service';
import type { BookCoverSSEWriter } from '../services/book-cover.service';
import { planBook } from '../services/book/planner.service';
import { runBookAgent } from '../services/book/book-agent-loop.service';
import { runPolishPipeline } from '../services/book/producer.service';
import { runContinuityAudit } from '../services/book/continuity-auditor.service';
import { runLineEdit } from '../services/book/line-editor.service';
import { runCopyEdit } from '../services/book/copy-editor.service';
import { formatBook } from '../services/book/formatter.service';
import { bundleBook } from '../services/book/bundler.service';
import { ApiError } from '../middleware/error.middleware';
import type { ChatMessage, AgentRequest } from '../types/chat';
import { debitForFeature } from '../services/wallet.service';
import { UsageEvent } from '../models/UsageEvent';
import mongoose from 'mongoose';

const router = Router();

/**
 * Prepend a research brief as a user message so the code-agent (which
 * has no browser tools) works from fresh facts. Appended AFTER the
 * original user prompt so the agent reads request → facts → act.
 */
function injectResearchBriefMessage(
  messages: ChatMessage[],
  brief: ResearchBrief,
): ChatMessage[] {
  const sources = brief.sources
    .slice(0, 8)
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
    .join('\n');
  const facts = brief.keyFacts.slice(0, 20).map((f) => `- ${f}`).join('\n');
  const contextBody = [
    `Research brief for: ${brief.query}`,
    '',
    brief.summary,
    '',
    'Key facts:',
    facts || '- (none)',
    '',
    'Sources:',
    sources || '(none)',
    '',
    'Use these facts in the build where accuracy matters (specs, numbers, names). Do not invent details the brief does not support.',
  ].join('\n');

  const briefMessage: ChatMessage = {
    role: 'user',
    content: contextBody,
  };

  const last = messages[messages.length - 1];
  if (!last) return [briefMessage];
  return [...messages.slice(0, -1), briefMessage, last];
}

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

      const {
        model,
        chatOnly,
        intent,
        needsResearch,
        researchQuery,
        researchBrief: providedBrief,
      } = req.body as {
        model?: string;
        chatOnly?: boolean;
        intent?: string;
        needsResearch?: boolean;
        researchQuery?: string;
        researchBrief?: ResearchBrief;
      };

      // Manus-style research pre-step. Runs silently before the code-agent
      // if the intent classifier flagged the topic as needing fresh facts.
      // Skipped in chat-only mode and for intents that aren't code-app.
      let researchBrief: ResearchBrief | undefined = providedBrief;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const e2bKey = process.env.E2B_API_KEY;
      const shouldResearch =
        !chatOnly &&
        intent === 'code-app' &&
        needsResearch === true &&
        !researchBrief &&
        Boolean(anthropicKey) &&
        Boolean(e2bKey) &&
        Boolean(researchQuery && researchQuery.trim().length > 0);

      if (shouldResearch) {
        writer.send('agent_phase', { phase: 'researching', query: researchQuery });
        const researchAdapter = {
          send(event: string, data: unknown) {
            if (closed) return;
            res.write(`event: research_${event}\ndata: ${JSON.stringify(data)}\n\n`);
          },
          end() {
            /* don't close — the agent stream continues */
          },
        } as unknown as ComputerSSEWriter;
        try {
          const brief = await runResearchAgent(researchQuery!, {
            userId: req.user!._id.toString(),
            sse: researchAdapter,
            apiKey: anthropicKey!,
            model,
          });
          researchBrief = brief;
          writer.send('research_brief_ready', brief);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writer.send('research_failed', { message });
          // Keep going — code-agent can still build without research.
        }
        writer.send('agent_phase', { phase: 'building' });
      }

      const agentMessages = researchBrief
        ? injectResearchBriefMessage(messages, researchBrief)
        : messages;

      await runCodeAgent(agentMessages, workspace || {}, writer, model, req.user!._id, { chatOnly });
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const status = (error as { status?: number })?.status;
      console.error(
        `[ai.routes] /agent failed${status ? ` status=${status}` : ''} — ${detail}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (!res.headersSent) {
        if (error instanceof ApiError) {
          next(error);
        } else if (error instanceof Error) {
          next(new ApiError(error.message, 500));
        } else {
          next(error);
        }
      } else {
        // Surface a short reason so the UI can show why instead of a bare
        // "Agent failed" — full detail lives in server logs above.
        const reason = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Agent failed', reason })}\n\n`,
        );
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
            model: validation.data.model,
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
          model: validation.data.model,
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
      const { query, model } = req.body as { query?: string; model?: string };
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
        const brief = await runResearchAgent(query, { userId, sse, apiKey, model });
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
      const { topic, sheetCount, style, sessionId, model } = (req.body ?? {}) as {
        topic?: string;
        sheetCount?: number;
        style?: 'simple' | 'detailed';
        sessionId?: string;
        model?: string;
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
        await generateSpreadsheet({ topic, sheetCount, style, sessionId, model }, req.user._id, writer);
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
      const { prompt, scriptText, voiceId, sessionId, kind, sfxDurationSec, musicLengthMs, model } = (req.body ?? {}) as {
        prompt?: string;
        scriptText?: string;
        voiceId?: string;
        sessionId?: string;
        kind?: 'tts' | 'sfx' | 'music';
        sfxDurationSec?: number;
        musicLengthMs?: number;
        model?: string;
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
        { prompt, scriptText, voiceId: effectiveVoiceId, sessionId, kind, sfxDurationSec, musicLengthMs, model },
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
      const { prompt, durationSec, sessionId, model } = (req.body ?? {}) as {
        prompt?: string;
        durationSec?: 5 | 10;
        sessionId?: string;
        model?: string;
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

      await generateVideo({ prompt, durationSec, sessionId, model }, req.user._id, writer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mr8 Book — plan-book endpoint (Planner meta-step, Slice 4a).
 * Synchronous — no SSE. Returns { strategy, rationale, questions? }.
 * Called once at the start of a new book-intent chat so Mr8 announces
 * its opening strategy before kicking off generation.
 */
router.post(
  '/plan-book',
  authenticate,
  intentClassifyRateLimiter, // same cheap-Haiku budget as intent classify
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = planBookSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ApiError(validation.error.errors[0].message, 400);
      }
      if (!req.user) {
        throw new ApiError('Unauthorized', 401);
      }
      const result = await planBook(validation.data.prompt, req.user._id);
      res.json(result);
    } catch (err) {
      if (err instanceof ApiError) next(err);
      else if (err instanceof Error) next(new ApiError(err.message, 500));
      else next(err);
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
            model: validation.data.model,
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
 * Mr8 Book — generate-book-cover SSE endpoint (Slice 2).
 * Full run: briefing_started → briefs_ready → cover_generating × 6
 *          → cover_ready × 6 → sandbox_synced → covers_complete.
 * Regenerate single: cover_generating → cover_ready → covers_complete.
 */
router.post(
  '/generate-book-cover',
  authenticate,
  coverGenerationRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = generateBookCoverSchema.safeParse(req.body);
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

      const writer: BookCoverSSEWriter = {
        send(event, data) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await generateBookCovers(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            regenerateIdx: validation.data.regenerateIdx,
            author: validation.data.author,
            sessionId: validation.data.sessionId,
            model: validation.data.model,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Cover generation crashed: ${message}` });
          writer.end();
        } catch { /* socket already closed */ }
        console.error('[book-cover] crashed after headers flushed', innerErr);
      }
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof ApiError) next(err);
        else if (err instanceof Error) next(new ApiError(err.message, 500));
        else next(err);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Cover generation failed' })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * Mr8 Book — draft-book SSE endpoint (Slice 4b).
 * Runs the book-agent tool-loop inside the E2B sandbox. Streams:
 *   book_agent_started → text_delta / tool_call / tool_result × N
 *   → draft.chapter_streaming × many (tokens as prose arrives)
 *   → draft.chapter_ready (after each write_file completes)
 *   → approval_required (when request_approval fires)
 *   → stage_complete (when complete_stage fires) → done | error.
 */
router.post(
  '/draft-book',
  authenticate,
  chapterDraftingRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = draftBookSchema.safeParse(req.body);
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

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await runBookAgent(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            stage: validation.data.stage,
            chapterN: validation.data.chapterN,
            directive: validation.data.directive,
            sessionId: validation.data.sessionId,
            model: validation.data.model,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Book drafting crashed: ${message}` });
          writer.end();
        } catch { /* socket already closed */ }
        console.error('[book-draft] crashed after headers flushed', innerErr);
      }
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof ApiError) next(err);
        else if (err instanceof Error) next(new ApiError(err.message, 500));
        else next(err);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Book drafting failed' })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * Mr8 Book — polish-book SSE endpoint (Slice 5).
 * Runs the full 3-pass pipeline: audit → line-edit → copy-edit. Streams
 * per-pass stage_started / per-chapter events / stage_complete and a
 * terminal pipeline_complete.
 */
router.post(
  '/polish-book',
  authenticate,
  chapterDraftingRateLimiter, // polish and drafting share budget; both are Sonnet-heavy
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = polishBookSchema.safeParse(req.body);
      if (!validation.success) throw new ApiError(validation.error.errors[0].message, 400);
      if (!req.user) throw new ApiError('Unauthorized', 401);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await runPolishPipeline(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            aggressiveness: validation.data.aggressiveness,
            directives: validation.data.directives,
            skipAudit: validation.data.skipAudit,
            sessionId: validation.data.sessionId,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Polish pipeline crashed: ${message}` });
          writer.end();
        } catch { /* socket already closed */ }
        console.error('[book-polish] crashed after headers flushed', innerErr);
      }
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof ApiError) next(err);
        else if (err instanceof Error) next(new ApiError(err.message, 500));
        else next(err);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Polish failed' })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * Mr8 Book — audit-book SSE endpoint (standalone re-audit, Slice 5).
 * Runs ONLY the Continuity Auditor. Useful for re-running audit after
 * manual edits without paying for the full polish pipeline.
 */
router.post(
  '/audit-book',
  authenticate,
  bookAuditRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = auditBookSchema.safeParse(req.body);
      if (!validation.success) throw new ApiError(validation.error.errors[0].message, 400);
      if (!req.user) throw new ApiError('Unauthorized', 401);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await runContinuityAudit(
          { bookId: validation.data.bookId, userId: req.user._id, sessionId: validation.data.sessionId, model: validation.data.model },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Audit crashed: ${message}` });
          writer.end();
        } catch { /* ignore */ }
      }
      if (!closed) writer.end();
    } catch (err) {
      if (!res.headersSent) next(err);
      else res.end();
    }
  }
);

/**
 * Mr8 Book — re-edit-chapter SSE endpoint (Slice 5).
 * Re-runs Line Editor + Copy Editor for a single chapter with user-chosen
 * aggressiveness + directives. Used by the Chapter sidebar's "Regenerate
 * edit" hover action.
 */
router.post(
  '/re-edit-chapter',
  authenticate,
  chapterDraftingRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = reEditChapterSchema.safeParse(req.body);
      if (!validation.success) throw new ApiError(validation.error.errors[0].message, 400);
      if (!req.user) throw new ApiError('Unauthorized', 401);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await runLineEdit(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            aggressiveness: validation.data.aggressiveness,
            directives: validation.data.directives,
            chapterN: validation.data.chapterN,
            sessionId: validation.data.sessionId,
            model: validation.data.model,
          },
          { send: writer.send, end() { /* outer owns */ } }
        );
        await runCopyEdit(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            chapterN: validation.data.chapterN,
            sessionId: validation.data.sessionId,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Re-edit crashed: ${message}` });
          writer.end();
        } catch { /* ignore */ }
      }
    } catch (err) {
      if (!res.headersSent) next(err);
      else res.end();
    }
  }
);

/**
 * Mr8 Book — format-book SSE endpoint (Slice 7.ii).
 * Runs the Formatter: toolchain install → theme assets → manuscript build →
 * composite EPUB cover → pandoc PDF/EPUB/DOCX → disk mirror under
 * `/uploads/books/<userId>/<bookId>/build/`. Streams toolchain_*, building,
 * ready, cover_*, and a terminal stage_complete with the artifacts[].
 */
router.post(
  '/format-book',
  authenticate,
  bookFormatRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = formatBookSchema.safeParse(req.body);
      if (!validation.success) throw new ApiError(validation.error.errors[0].message, 400);
      if (!req.user) throw new ApiError('Unauthorized', 401);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await formatBook(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            sessionId: validation.data.sessionId,
            formats: validation.data.formats,
            forceReformat: validation.data.forceReformat,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Format crashed: ${message}` });
          writer.end();
        } catch { /* ignore */ }
      }
    } catch (err) {
      if (!res.headersSent) next(err);
      else res.end();
    }
  }
);

/**
 * Mr8 Book — bundle-book SSE endpoint (Slice 7.iii).
 * Zips the contents of the sandbox's `/home/user/book/build/` (plus later
 * audio + translations) into `Mr8-Book-<slug>-<YYYYMMDD>.zip`, mirrors to
 * `/uploads/books/<userId>/<bookId>/bundle/`, sets `book.bundleUrl` +
 * `book.publishedBundleAt` + `book.status = 'done'`. Streams
 * `bundle.progress { pct }` every ~10%, terminal `bundle_ready` +
 * `stage_complete { stage: 'export' }`.
 */
router.post(
  '/bundle-book',
  authenticate,
  bookBundleRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = bundleBookSchema.safeParse(req.body);
      if (!validation.success) throw new ApiError(validation.error.errors[0].message, 400);
      if (!req.user) throw new ApiError('Unauthorized', 401);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      req.on('close', () => { closed = true; });

      const writer = {
        send(event: string, data: unknown) {
          if (closed) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          if (!closed) res.end();
        },
      };

      try {
        await bundleBook(
          {
            bookId: validation.data.bookId,
            userId: req.user._id,
            sessionId: validation.data.sessionId,
          },
          writer
        );
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        try {
          writer.send('error', { message: `Bundle crashed: ${message}` });
          writer.end();
        } catch { /* ignore */ }
      }
    } catch (err) {
      if (!res.headersSent) next(err);
      else res.end();
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
      const { prompt, preferredCharts, sessionId, model } = (req.body ?? {}) as {
        prompt?: string;
        preferredCharts?: ChartKind[];
        sessionId?: string;
        model?: string;
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

      await generateVisualization({ prompt, preferredCharts, sessionId, model }, req.user._id, writer);
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
