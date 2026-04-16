/**
 * App-chat proxy: forwards the generated app's chat widget requests to
 * Anthropic. The widget hits this endpoint with a widget-scoped JWT.
 * Mr8's real Anthropic key never leaves the backend.
 *
 * - `POST /api/app-chat/widgets` — authenticated Mr8 user creates a
 *   widget for a named project, gets `{ widgetId, jwt, proxyUrl }`.
 * - `POST /api/app-chat/:widgetId` — unauthenticated (widget JWT in
 *   body). Streams the Anthropic response back as SSE.
 */
import { Router, type Request, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate } from '../middleware/auth.middleware';
import {
  APP_CHAT_LIMITS,
  createWidget,
  recordCostCents,
  reserveRequest,
  verifyWidgetJwt,
} from '../services/app-chat.service';

const router = Router();

/** POST /api/app-chat/widgets — create a widget (authenticated Mr8 user). */
router.post('/widgets', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const { projectName } = (req.body ?? {}) as { projectName?: string };
  if (!projectName || projectName.trim().length === 0) {
    res.status(400).json({ message: 'projectName is required' });
    return;
  }
  try {
    const widget = await createWidget(userId, projectName.trim().slice(0, 200));
    res.status(201).json(widget);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg });
  }
});

/**
 * POST /api/app-chat/:widgetId — proxy chat request.
 * Body: `{ jwt, messages, system?, model? }`.
 * Streams `event: delta` / `event: done` / `event: error` SSE frames.
 */
router.post('/:widgetId', async (req: Request, res: Response) => {
  const { widgetId } = req.params;
  const { jwt: widgetJwt, messages, system, model } = (req.body ?? {}) as {
    jwt?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    model?: string;
  };
  if (!widgetJwt) {
    res.status(401).json({ message: 'widget jwt required' });
    return;
  }
  const payload = verifyWidgetJwt(widgetJwt);
  if (!payload || payload.widgetId !== widgetId) {
    res.status(401).json({ message: 'invalid widget jwt' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ message: 'messages required' });
    return;
  }

  const charge = await reserveRequest(widgetId);
  if (!charge.ok) {
    const status = charge.reason === 'not-found' ? 404 : 429;
    res.status(status).json({
      message:
        charge.reason === 'daily-cap'
          ? `Daily request cap reached (${APP_CHAT_LIMITS.DAILY_REQUEST_CAP}). Try again tomorrow.`
          : charge.reason === 'monthly-cap'
            ? 'Monthly budget for this chat is used up. Ask the owner to top up.'
            : 'Widget not found',
    });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ message: 'Anthropic key not configured' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const client = new Anthropic({ apiKey });
  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  try {
    const stream = await client.messages.stream({
      model: model ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: system ?? undefined,
      messages: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (closed) break;
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
    const finalMsg = await stream.finalMessage();
    const usage = finalMsg.usage;
    // Rough Haiku cost ~$1 per 1M input, ~$5 per 1M output — in cents.
    const cents = Math.ceil(
      ((usage.input_tokens ?? 0) / 10000) + ((usage.output_tokens ?? 0) / 2000)
    );
    await recordCostCents(widgetId, Math.max(1, cents));
    if (!closed) {
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      res.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!closed) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
        res.end();
      } catch {
        // socket already dead
      }
    }
  }
});

export default router;
