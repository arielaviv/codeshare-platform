/**
 * ElevenLabs voices proxy. Returns a curated list of voices the user can
 * pick from in the Personalization modal.
 *
 * We cache the full list in-memory for 1h — ElevenLabs voices are stable.
 */
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

export interface VoiceSummary {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  previewUrl?: string;
  description?: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let cache: { data: VoiceSummary[]; expiresAt: number } | null = null;

/** A small curated fallback so the UI renders even when ElevenLabs is down. */
const FALLBACK_VOICES: VoiceSummary[] = [
  {
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    category: 'premade',
    labels: { accent: 'american', description: 'deep', gender: 'male' },
  },
  {
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella',
    category: 'premade',
    labels: { accent: 'american', description: 'soft', gender: 'female' },
  },
  {
    voiceId: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    category: 'premade',
    labels: { accent: 'american', description: 'well-rounded', gender: 'male' },
  },
  {
    voiceId: 'MF3mGyEYCl7XYWbV9V6O',
    name: 'Elli',
    category: 'premade',
    labels: { accent: 'american', description: 'emotional', gender: 'female' },
  },
  {
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    category: 'premade',
    labels: { accent: 'american', description: 'deep', gender: 'male' },
  },
  {
    voiceId: 'VR6AewLTigWG4xSOukaG',
    name: 'Arnold',
    category: 'premade',
    labels: { accent: 'american', description: 'crisp', gender: 'male' },
  },
  {
    voiceId: 'pMsXgVXv3BLzUgSXRplE',
    name: 'Serena',
    category: 'premade',
    labels: { accent: 'american', description: 'pleasant', gender: 'female' },
  },
  {
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',
    name: 'Sam',
    category: 'premade',
    labels: { accent: 'american', description: 'raspy', gender: 'male' },
  },
];

async function fetchElevenLabsVoices(): Promise<VoiceSummary[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return FALLBACK_VOICES;

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) return FALLBACK_VOICES;
    const body = (await response.json()) as { voices: ElevenLabsVoice[] };
    const voices = Array.isArray(body.voices) ? body.voices : [];
    return voices.slice(0, 40).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels ?? {},
      previewUrl: v.preview_url,
      description: v.description,
    }));
  } catch {
    return FALLBACK_VOICES;
  }
}

/** GET /api/voices — curated list for the Personalization picker. */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    res.json({ voices: cache.data });
    return;
  }
  const voices = await fetchElevenLabsVoices();
  cache = { data: voices, expiresAt: now + CACHE_TTL_MS };
  res.json({ voices });
});

export default router;
