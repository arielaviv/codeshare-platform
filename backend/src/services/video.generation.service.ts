import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { VideoFile } from '../models/VideoFile';
import { UsageEvent } from '../models/UsageEvent';
import { resolveUserModel } from './model-select';

export interface VideoSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateVideoRequest {
  prompt: string;
  durationSec?: 5 | 10;
  sessionId?: string;
  model?: string;
}

const RUNWAY_API = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';
const UPLOADS_BASE = path.join(__dirname, '../../uploads/video');
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000; // 5 min hard cap

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

const REFINE_SYSTEM_PROMPT = `You rewrite short user prompts into cinematic
prompts for the Runway Gen-4 Turbo video model. Output ONLY the refined
prompt — no preamble, no quotes, no markdown.

Add cinematography hints (camera angle, lighting, mood, motion) but stay
true to the user's intent. Keep under 250 chars. No emojis.`;

async function refinePrompt(userPrompt: string, model: string): Promise<string> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: REFINE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content.find(
      (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
    );
    return (block?.text ?? userPrompt).trim().slice(0, 500);
  } catch {
    return userPrompt;
  }
}

interface RunwayTask {
  id: string;
  status: string; // PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED | THROTTLED
  output?: string[]; // array of output URLs
  failure?: string;
  progress?: number;
}

async function runwayCreateTask(refinedPrompt: string, durationSec: 5 | 10): Promise<string> {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error('RUNWAYML_API_SECRET not configured');

  // Gen-4 Turbo — current Runway flagship text-to-video.
  // Supported ratios: 1280:720 (16:9), 720:1280 (9:16), 960:960 (1:1),
  // 1104:832 (4:3), 832:1104 (3:4), 1584:672 (21:9).
  const response = await fetch(`${RUNWAY_API}/text_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify({
      promptText: refinedPrompt,
      model: 'gen4_turbo',
      duration: durationSec,
      ratio: '1280:720',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Runway create ${response.status}: ${errBody.slice(0, 300)}`);
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function runwayGetTask(taskId: string): Promise<RunwayTask> {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  const response = await fetch(`${RUNWAY_API}/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`Runway poll ${response.status}`);
  }
  return (await response.json()) as RunwayTask;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
}

function deriveTitle(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

function estimateCostCents(durationSec: number): number {
  // Runway Gen-3 Turbo retail ≈ $0.05/sec.
  // Pass-through with 100% margin → user pays ~$0.10/sec.
  // Polish floor: 19 cents.
  return Math.max(19, Math.ceil(durationSec * 5 * 2));
}

export async function generateVideo(
  req: GenerateVideoRequest,
  userId: mongoose.Types.ObjectId,
  writer: VideoSSEWriter
): Promise<void> {
  const durationSec: 5 | 10 = req.durationSec === 10 ? 10 : 5;
  writer.send('video_started', { prompt: req.prompt, durationSec });

  const refineModel = resolveUserModel(req.model, 'claude-haiku-4-5-20251001');

  // 1) Refine prompt
  const refined = await refinePrompt(req.prompt, refineModel);
  writer.send('prompt_refined', { refinedPrompt: refined });

  // 2) Create Runway task
  let taskId: string;
  try {
    taskId = await runwayCreateTask(refined, durationSec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Runway create failed: ${msg}` });
    writer.end();
    return;
  }

  // Persist as queued
  const doc = await VideoFile.create({
    userId,
    sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
    title: deriveTitle(req.prompt),
    sourcePrompt: req.prompt,
    refinedPrompt: refined,
    durationSec,
    runwayJobId: taskId,
    status: 'queued',
    costCents: estimateCostCents(durationSec),
  });

  writer.send('runway_queued', { taskId, durationSec });

  // 3) Poll until done / timeout
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastProgress = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let task: RunwayTask;
    try {
      task = await runwayGetTask(taskId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writer.send('error', { message: `Runway poll failed: ${msg}` });
      writer.end();
      await VideoFile.findByIdAndUpdate(doc._id, { status: 'failed', failReason: msg });
      return;
    }
    if (typeof task.progress === 'number' && task.progress !== lastProgress) {
      lastProgress = task.progress;
      writer.send('runway_progress', { percent: Math.round(task.progress * 100) });
    }
    if (task.status === 'SUCCEEDED' && task.output && task.output.length > 0) {
      const remoteUrl = task.output[0];
      const userDir = path.join(UPLOADS_BASE, userId.toString());
      ensureDir(userDir);
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`;
      const filepath = path.join(userDir, filename);
      try {
        await downloadToFile(remoteUrl, filepath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        writer.send('error', { message: `Download failed: ${msg}` });
        writer.end();
        return;
      }
      const publicUrl = `/uploads/video/${userId.toString()}/${filename}`;
      await VideoFile.findByIdAndUpdate(doc._id, {
        status: 'succeeded',
        videoUrl: publicUrl,
        videoPath: filepath,
      });
      try {
        await UsageEvent.create({
          userId,
          sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
          feature: 'code-agent',
          modelName: 'runway-gen4-turbo',
          inputTokens: refined.length,
          outputTokens: 0,
          costCents: doc.costCents,
        });
      } catch {
        // ignore
      }
      writer.send('video_ready', {
        videoId: doc._id.toString(),
        videoUrl: publicUrl,
        durationSec,
        refinedPrompt: refined,
      });
      writer.end();
      return;
    }
    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      const reason = task.failure ?? task.status;
      await VideoFile.findByIdAndUpdate(doc._id, { status: 'failed', failReason: reason });
      writer.send('video_failed', { reason });
      writer.end();
      return;
    }
  }

  // Timeout
  await VideoFile.findByIdAndUpdate(doc._id, { status: 'failed', failReason: 'poll timeout' });
  writer.send('video_failed', { reason: 'Generation took longer than 5 minutes — gave up.' });
  writer.end();
}
