import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { AudioFile } from '../models/AudioFile';
import { UsageEvent } from '../models/UsageEvent';

export interface AudioSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateAudioRequest {
  prompt: string;
  /** If provided, skip script-drafting and TTS this verbatim. */
  scriptText?: string;
  /** ElevenLabs voice id; defaults to Adam. */
  voiceId?: string;
  sessionId?: string;
}

const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (English, neutral)
const DEFAULT_VOICE_NAME = 'Adam';
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const UPLOADS_BASE = path.join(__dirname, '../../uploads/audio');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

const SCRIPT_SYSTEM_PROMPT = `You write spoken-word scripts for AI text-to-speech.

Given a user prompt describing the desired audio (podcast, voiceover, audio
guide, summary, etc.), draft the script that will be read aloud.

Rules:
- Write only the words to be spoken. No stage directions, no [music],
  no "Voice 1:" labels.
- Use full sentences with natural cadence; avoid shouty exclamation.
- Spell out numbers when they sound better that way ("twenty-five" not "25").
- Length: match the user's intent. Default ~200 words (~90 seconds).
  If user asks for "podcast" or specifies minutes, scale accordingly.
- No emojis. No markdown. Just the script text.`;

async function draftScript(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SCRIPT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find(
    (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
  );
  return (block?.text ?? '').trim();
}

async function ttsElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}: ${errBody.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function estimateCostCents(charCount: number): number {
  // ElevenLabs ~$0.30/1k chars at standard tier. Pass-through with margin.
  // Polish tier floor: 5 cents minimum.
  return Math.max(5, Math.ceil((charCount / 1000) * 30 * 1.5));
}

function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export async function generateAudio(
  req: GenerateAudioRequest,
  userId: mongoose.Types.ObjectId,
  writer: AudioSSEWriter
): Promise<void> {
  writer.send('audio_started', { prompt: req.prompt });

  // 1) Draft script (or use provided)
  let script = req.scriptText?.trim() ?? '';
  if (!script) {
    try {
      script = await draftScript(req.prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writer.send('error', { message: `Script draft failed: ${msg}` });
      writer.end();
      return;
    }
    writer.send('script_drafted', { text: script });
  }

  if (!script || script.length < 10) {
    writer.send('error', { message: 'Script is too short or empty' });
    writer.end();
    return;
  }

  // 2) TTS via ElevenLabs
  const voiceId = req.voiceId ?? DEFAULT_VOICE_ID;
  writer.send('tts_generating', { voiceId, voiceName: DEFAULT_VOICE_NAME, charCount: script.length });

  let audioBuffer: Buffer;
  try {
    audioBuffer = await ttsElevenLabs(script, voiceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `TTS failed: ${msg}` });
    writer.end();
    return;
  }

  // 3) Save MP3
  const userDir = path.join(UPLOADS_BASE, userId.toString());
  ensureDir(userDir);
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp3`;
  const filepath = path.join(userDir, filename);
  fs.writeFileSync(filepath, audioBuffer);
  const publicUrl = `/uploads/audio/${userId.toString()}/${filename}`;
  // Approximate duration: MP3 at 128kbps → 16KB/sec
  const durationSec = Math.max(1, Math.round(audioBuffer.byteLength / (128 * 1024 / 8)));
  const costCents = estimateCostCents(script.length);

  // 4) Persist
  const doc = await AudioFile.create({
    userId,
    sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
    title: deriveTitle(req.prompt),
    sourcePrompt: req.prompt,
    scriptText: script,
    voiceId,
    voiceName: DEFAULT_VOICE_NAME,
    durationSec,
    audioUrl: publicUrl,
    audioPath: filepath,
    costCents,
  });

  // 5) Usage event (best-effort)
  try {
    await UsageEvent.create({
      userId,
      sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
      feature: 'code-agent',
      modelName: 'elevenlabs-turbo-v2.5',
      inputTokens: script.length,
      outputTokens: 0,
      costCents,
    });
  } catch {
    // ignore
  }

  writer.send('audio_ready', {
    audioId: doc._id.toString(),
    audioUrl: publicUrl,
    durationSec,
    voiceName: DEFAULT_VOICE_NAME,
    scriptText: script,
  });
  writer.end();
}
