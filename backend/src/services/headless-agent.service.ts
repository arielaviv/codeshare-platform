/**
 * Headless agent runner for scheduled tasks.
 *
 * Invoked by the cron scheduler (or any background trigger) to run an
 * agent flow without an SSE client attached. Persists the transcript as
 * ChatItems onto the ChatSession so the user can hydrate the result the
 * next time they open that session from the sidebar popover.
 *
 * Mode coverage:
 *  - `research`  full — runs the research agent, persists brief + sources
 *  - `audio`     full — generates TTS via ElevenLabs, persists audio card
 *  - `chat`      full — Haiku one-shot answer
 *  - other modes fall back to a chat-style Haiku answer with a note that
 *    the mode is not background-capable (keeps the session non-empty so
 *    the user sees something actionable).
 */
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { ChatSession, type StoredChatItem } from '../models/ChatSession';
import type { ScheduledTaskMode } from '../models/ScheduledTask';
import { runResearchAgent } from './research/research-agent.service';
import { generateAudio, type AudioSSEWriter } from './audio.generation.service';
import type { ComputerSSEWriter } from './computer/sse-writer';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function noopComputerWriter(): ComputerSSEWriter {
  return {
    send: () => undefined,
    end: () => undefined,
  };
}

function captureAudioWriter(): {
  writer: AudioSSEWriter;
  events: Array<{ event: string; data: unknown }>;
} {
  const events: Array<{ event: string; data: unknown }> = [];
  return {
    events,
    writer: {
      send: (event, data) => {
        events.push({ event, data });
      },
      end: () => undefined,
    },
  };
}

async function appendItems(
  sessionId: mongoose.Types.ObjectId,
  items: StoredChatItem[]
): Promise<void> {
  if (items.length === 0) return;
  await ChatSession.findByIdAndUpdate(sessionId, {
    $push: { messages: { $each: items } },
    $inc: { messageCount: items.length, unreadCount: 1 },
  });
}

async function runChatFallback(prompt: string, note?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return note ?? 'Background run skipped (Anthropic not configured).';
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:
      'You are Mr8, a helpful assistant. Reply concisely and directly. No emojis, no preamble.',
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find(
    (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
  );
  const text = (block?.text ?? '').trim();
  if (note) return `${text}\n\n${note}`.trim();
  return text || 'No response generated.';
}

export interface HeadlessRunOptions {
  sessionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  mode: ScheduledTaskMode;
  prompt: string;
  taskTitle: string;
}

export async function runHeadlessAgent(options: HeadlessRunOptions): Promise<void> {
  const { sessionId, userId, mode, prompt, taskTitle } = options;

  await appendItems(sessionId, [
    {
      id: genId(),
      kind: 'user',
      content: prompt,
    },
  ]);

  try {
    if (mode === 'research') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const e2bKey = process.env.E2B_API_KEY;
      if (!apiKey || !e2bKey) {
        await appendItems(sessionId, [
          {
            id: genId(),
            kind: 'assistant-text',
            content:
              'Research skipped — ANTHROPIC_API_KEY or E2B_API_KEY is missing on the server.',
          },
        ]);
        return;
      }
      const brief = await runResearchAgent(prompt, {
        userId: userId.toString(),
        sse: noopComputerWriter(),
        apiKey,
      });
      await appendItems(sessionId, [
        {
          id: genId(),
          kind: 'assistant-text',
          content: `Here's what I found on "${taskTitle}":`,
        },
        {
          id: genId(),
          kind: 'research-brief',
          brief,
        },
      ]);
      return;
    }

    if (mode === 'audio') {
      const { writer, events } = captureAudioWriter();
      await generateAudio({ prompt, sessionId: sessionId.toString() }, userId, writer);
      const ready = events.find((e) => e.event === 'audio_ready');
      if (!ready) {
        const errEvent = events.find((e) => e.event === 'error');
        const errMsg = (errEvent?.data as { message?: string } | undefined)?.message;
        await appendItems(sessionId, [
          {
            id: genId(),
            kind: 'assistant-text',
            content: errMsg
              ? `Audio generation failed: ${errMsg}`
              : 'Audio generation did not complete.',
          },
        ]);
        return;
      }
      const data = ready.data as {
        audioUrl: string;
        durationSec: number;
        voiceName: string;
        scriptText: string;
      };
      await appendItems(sessionId, [
        {
          id: genId(),
          kind: 'assistant-text',
          content: `Here's your scheduled audio on "${taskTitle}":`,
        },
        {
          id: genId(),
          kind: 'audio-ready',
          audioUrl: data.audioUrl,
          durationSec: data.durationSec,
          voiceName: data.voiceName,
          scriptText: data.scriptText,
          title: taskTitle,
        },
      ]);
      return;
    }

    if (mode === 'chat') {
      const reply = await runChatFallback(prompt);
      await appendItems(sessionId, [
        { id: genId(), kind: 'assistant-text', content: reply },
      ]);
      return;
    }

    // For heavy modes (code, deck, sheet, design, video, visualization),
    // give the user a useful Haiku summary plus a note that the real
    // build runs when they open the session.
    const note =
      `This is a scheduled ${mode} run. The full ${mode} flow needs an ` +
      'interactive session — open this chat to continue where Mr8 left off.';
    const reply = await runChatFallback(prompt, note);
    await appendItems(sessionId, [
      { id: genId(), kind: 'assistant-text', content: reply },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendItems(sessionId, [
      {
        id: genId(),
        kind: 'assistant-text',
        content: `Scheduled run failed: ${msg}`,
      },
    ]);
  }
}
