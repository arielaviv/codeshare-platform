import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { AudioFile } from '../models/AudioFile';
import { UsageEvent } from '../models/UsageEvent';
import { craftBibleFor } from './writing/craft-bible';
import { resolveUserModel } from './model-select';

export interface AudioSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export type AudioKind = 'tts' | 'sfx' | 'music';

export interface GenerateAudioRequest {
  prompt: string;
  /** If provided, skip script-drafting and TTS this verbatim. */
  scriptText?: string;
  /** ElevenLabs voice id; defaults to Adam. */
  voiceId?: string;
  /** Optional voice name for display; looked up if missing. */
  voiceName?: string;
  /** Kind of audio — if omitted, classified via Haiku. */
  kind?: AudioKind;
  /** SFX duration seconds (ElevenLabs sound-generation), default 5. */
  sfxDurationSec?: number;
  /** Music length ms (ElevenLabs Music), default 10000. */
  musicLengthMs?: number;
  sessionId?: string;
  model?: string;
}

const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (English, neutral)
const DEFAULT_VOICE_NAME = 'Adam';

/** Hardcoded fallback map so we can show a name even without an ElevenLabs lookup. */
const KNOWN_VOICE_NAMES: Record<string, string> = {
  pNInz6obpgDQGcFmaJgB: 'Adam',
  EXAVITQu4vr4xnSDxMaL: 'Bella',
  ErXwobaYiN019PkySvjV: 'Antoni',
  MF3mGyEYCl7XYWbV9V6O: 'Elli',
  TxGEqnHWrfWFTfGW9XjX: 'Josh',
  VR6AewLTigWG4xSOukaG: 'Arnold',
  pMsXgVXv3BLzUgSXRplE: 'Serena',
  yoZ06aMxZJJ28mfd3POQ: 'Sam',
};
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const UPLOADS_BASE = path.join(__dirname, '../../uploads/audio');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

const SCRIPT_SYSTEM_PROMPT = `You write spoken-word scripts for AI text-to-speech.

${craftBibleFor({ purpose: 'audio-script' })}

## TASK

Given a user prompt describing the desired audio (podcast, voiceover, audio
guide, summary, etc.), draft the script that will be read aloud.

Rules specific to TTS delivery:
- Write only the words to be spoken. No stage directions, no [music],
  no "Voice 1:" labels.
- Use full sentences with natural cadence; avoid shouty exclamation.
- Spell out numbers when they sound better that way ("twenty-five" not "25").
- Length: match the user's intent. Default ~200 words (~90 seconds).
  If user asks for "podcast" or specifies minutes, scale accordingly.
- No emojis. No markdown. Just the script text.
- Vary sentence length for audible rhythm — same-length sentences in a row
  sound flat when voiced.
- Transitions between ideas should use phrases from the TRANSITIONS craft
  section ("by contrast", "so", "meanwhile") — never "firstly / secondly /
  finally" which sound like bullet points when read aloud.`;

async function draftScript(prompt: string, model: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  const response = await client.messages.create({
    model,
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

async function sfxElevenLabs(prompt: string, durationSec: number): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const clamped = Math.max(0.5, Math.min(22, durationSec));
  const url = `${ELEVENLABS_API}/sound-generation`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: clamped,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`ElevenLabs SFX ${response.status}: ${errBody.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function musicElevenLabs(prompt: string, lengthMs: number): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const clamped = Math.max(10000, Math.min(300000, lengthMs));
  const url = `${ELEVENLABS_API}/music`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: clamped,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`ElevenLabs Music ${response.status}: ${errBody.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const AUDIO_CLASSIFIER_PROMPT = `Classify the user's audio prompt as one of three kinds:

- "tts"   — spoken words. Podcasts, narration, voiceover, audio guide, read-aloud, summary, show, explainer.
- "sfx"   — sound effects. Non-musical, short. Explosion, rain, whoosh, click, footsteps, city ambience, door slam.
- "music" — musical composition. Song, track, background music, jazz, cinematic score, beat, melody, instrumental.

Reply with ONLY the single word: tts, sfx, or music. No punctuation.`;

async function classifyAudioKind(prompt: string): Promise<AudioKind> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'tts';
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      system: AUDIO_CLASSIFIER_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content.find(
      (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
    );
    const raw = (block?.text ?? '').trim().toLowerCase();
    if (raw.startsWith('sfx')) return 'sfx';
    if (raw.startsWith('music')) return 'music';
    return 'tts';
  } catch {
    return 'tts';
  }
}

function estimateTtsCostCents(charCount: number): number {
  // ElevenLabs ~$0.30/1k chars at standard tier. Pass-through with margin.
  // Polish tier floor: 5 cents minimum.
  return Math.max(5, Math.ceil((charCount / 1000) * 30 * 1.5));
}

function estimateSfxCostCents(durationSec: number): number {
  // ElevenLabs SFX pricing is roughly fixed-per-generation; flat floor.
  return Math.max(5, Math.ceil(durationSec));
}

function estimateMusicCostCents(lengthMs: number): number {
  // Music generation is heavier; rough 5c per 10s.
  return Math.max(19, Math.ceil((lengthMs / 10000) * 5));
}

function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

async function writeMp3(userId: mongoose.Types.ObjectId, buffer: Buffer): Promise<{
  filepath: string;
  publicUrl: string;
  durationSec: number;
}> {
  const userDir = path.join(UPLOADS_BASE, userId.toString());
  ensureDir(userDir);
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp3`;
  const filepath = path.join(userDir, filename);
  fs.writeFileSync(filepath, buffer);
  const publicUrl = `/uploads/audio/${userId.toString()}/${filename}`;
  const durationSec = Math.max(1, Math.round(buffer.byteLength / (128 * 1024 / 8)));
  return { filepath, publicUrl, durationSec };
}

export async function generateAudio(
  req: GenerateAudioRequest,
  userId: mongoose.Types.ObjectId,
  writer: AudioSSEWriter
): Promise<void> {
  writer.send('audio_started', { prompt: req.prompt });

  const audioModel = resolveUserModel(req.model, 'claude-haiku-4-5-20251001');

  // Classify kind if not explicitly provided.
  const kind: AudioKind = req.kind ?? (await classifyAudioKind(req.prompt));
  writer.send('audio_kind', { kind });

  // --- SFX branch ---
  if (kind === 'sfx') {
    const duration = req.sfxDurationSec ?? 5;
    writer.send('sfx_generating', { durationSec: duration, prompt: req.prompt });
    let buffer: Buffer;
    try {
      buffer = await sfxElevenLabs(req.prompt, duration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writer.send('error', { message: `SFX failed: ${msg}` });
      writer.end();
      return;
    }
    const { filepath, publicUrl, durationSec } = await writeMp3(userId, buffer);
    const costCents = estimateSfxCostCents(durationSec);
    const doc = await AudioFile.create({
      userId,
      sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
      title: deriveTitle(req.prompt),
      sourcePrompt: req.prompt,
      scriptText: req.prompt,
      voiceId: 'sfx',
      voiceName: 'Sound Effect',
      kind: 'sfx',
      durationSec,
      audioUrl: publicUrl,
      audioPath: filepath,
      costCents,
    });
    try {
      await UsageEvent.create({
        userId,
        sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
        feature: 'code-agent',
        modelName: 'elevenlabs-sound-generation',
        inputTokens: req.prompt.length,
        outputTokens: 0,
        costCents,
      });
    } catch { /* ignore */ }
    writer.send('audio_ready', {
      audioId: doc._id.toString(),
      audioUrl: publicUrl,
      durationSec,
      voiceName: 'Sound Effect',
      scriptText: req.prompt,
      kind: 'sfx',
    });
    writer.end();
    return;
  }

  // --- Music branch ---
  if (kind === 'music') {
    const lengthMs = req.musicLengthMs ?? 30000;
    writer.send('music_generating', { lengthMs, prompt: req.prompt });
    let buffer: Buffer;
    try {
      buffer = await musicElevenLabs(req.prompt, lengthMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writer.send('error', { message: `Music failed: ${msg}` });
      writer.end();
      return;
    }
    const { filepath, publicUrl, durationSec } = await writeMp3(userId, buffer);
    const costCents = estimateMusicCostCents(lengthMs);
    const doc = await AudioFile.create({
      userId,
      sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
      title: deriveTitle(req.prompt),
      sourcePrompt: req.prompt,
      scriptText: req.prompt,
      voiceId: 'music',
      voiceName: 'Music',
      kind: 'music',
      durationSec,
      audioUrl: publicUrl,
      audioPath: filepath,
      costCents,
    });
    try {
      await UsageEvent.create({
        userId,
        sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
        feature: 'code-agent',
        modelName: 'elevenlabs-music',
        inputTokens: req.prompt.length,
        outputTokens: 0,
        costCents,
      });
    } catch { /* ignore */ }
    writer.send('audio_ready', {
      audioId: doc._id.toString(),
      audioUrl: publicUrl,
      durationSec,
      voiceName: 'Music',
      scriptText: req.prompt,
      kind: 'music',
    });
    writer.end();
    return;
  }

  // --- TTS branch (original) ---
  let script = req.scriptText?.trim() ?? '';
  if (!script) {
    try {
      script = await draftScript(req.prompt, audioModel);
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

  const voiceId = req.voiceId ?? DEFAULT_VOICE_ID;
  const voiceName = req.voiceName ?? KNOWN_VOICE_NAMES[voiceId] ?? DEFAULT_VOICE_NAME;
  writer.send('tts_generating', { voiceId, voiceName, charCount: script.length });

  let audioBuffer: Buffer;
  try {
    audioBuffer = await ttsElevenLabs(script, voiceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `TTS failed: ${msg}` });
    writer.end();
    return;
  }

  const { filepath, publicUrl, durationSec } = await writeMp3(userId, audioBuffer);
  const costCents = estimateTtsCostCents(script.length);

  const doc = await AudioFile.create({
    userId,
    sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
    title: deriveTitle(req.prompt),
    sourcePrompt: req.prompt,
    scriptText: script,
    voiceId,
    voiceName,
    kind: 'tts',
    durationSec,
    audioUrl: publicUrl,
    audioPath: filepath,
    costCents,
  });

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
    voiceName,
    scriptText: script,
    kind: 'tts',
  });
  writer.end();
}
