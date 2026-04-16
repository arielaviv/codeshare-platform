import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import { GeneratedImageCache } from '../models/GeneratedImageCache';

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';
export type ImageQuality = 'low' | 'medium' | 'high';

export interface GenerateImageOptions {
  userId: mongoose.Types.ObjectId | string;
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
  /** Subdirectory under /uploads/generated/<userId>/. Defaults to none. */
  subdir?: string;
  /** Optional explicit filename (without extension). If omitted, a hash prefix is used. */
  filenameHint?: string;
  /** Skip cache lookup — always fresh. Useful for regenerate flows. */
  noCache?: boolean;
}

export interface GenerateImageResult {
  imageUrl: string;
  filepath: string;
  width: number;
  height: number;
  costCents: number;
  cached: boolean;
}

const UPLOADS_BASE = path.join(__dirname, '../../uploads/generated');

let cachedOpenAI: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (cachedOpenAI) return cachedOpenAI;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  cachedOpenAI = new OpenAI({ apiKey: key });
  return cachedOpenAI;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function cacheKey(prompt: string, size: string, quality: string): string {
  return crypto.createHash('sha256').update(`${prompt}::${size}::${quality}`).digest('hex');
}

export function costCentsFor(size: string, quality: string): number {
  // gpt-image-1 retail + Polish-tier markup (covers infra + margin).
  const isLandscape = size !== '1024x1024';
  if (quality === 'high') return isLandscape ? 25 : 19;
  if (quality === 'medium') return 10;
  return 5;
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly kind: 'no-api-key' | 'billing' | 'openai' | 'empty' | 'missing-b64'
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

/**
 * Generate a single image with gpt-image-1, write it to disk under
 * /uploads/generated/<userId>/[subdir/]<filename>.png, persist a cache
 * row, and return the public URL + filepath.
 *
 * Shared by the `generate_image` agent tool and the book-cover service.
 * No SSE events emitted — callers that want live progress wrap this.
 */
export async function generateImageToFile(
  opts: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { prompt, size = '1024x1024', quality = 'medium', subdir, filenameHint, noCache } = opts;

  if (!prompt || prompt.trim().length === 0) {
    throw new ImageGenerationError('Prompt is required', 'empty');
  }

  const client = getOpenAI();
  if (!client) {
    throw new ImageGenerationError(
      'OPENAI_API_KEY is not configured. Image generation unavailable.',
      'no-api-key'
    );
  }

  const userKey = opts.userId.toString();
  const baseDir = subdir ? path.join(UPLOADS_BASE, userKey, subdir) : path.join(UPLOADS_BASE, userKey);
  ensureDir(baseDir);

  const key = cacheKey(prompt, size, quality);

  // Cache lookup — opt out via noCache for regenerate flows.
  if (!noCache) {
    try {
      const cached = await GeneratedImageCache.findOne({ key });
      if (cached) {
        return {
          imageUrl: cached.imageUrl,
          filepath: cached.path,
          width: cached.width,
          height: cached.height,
          costCents: cached.costCents ?? costCentsFor(size, quality),
          cached: true,
        };
      }
    } catch {
      // Cache miss is fine
    }
  }

  let result;
  try {
    result = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size,
      quality,
      n: 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/billing|quota|insufficient|credit|limit/i.test(message)) {
      throw new ImageGenerationError(
        'OpenAI billing or quota limit reached. Top up billing.openai.com and retry.',
        'billing'
      );
    }
    throw new ImageGenerationError(`OpenAI image generation failed: ${message}`, 'openai');
  }

  if (!result?.data || result.data.length === 0) {
    throw new ImageGenerationError('OpenAI returned no images.', 'empty');
  }

  const first = result.data[0];
  const b64 = first.b64_json;
  if (!b64) {
    throw new ImageGenerationError('OpenAI response missing b64_json.', 'missing-b64');
  }

  const stem = filenameHint ?? key.slice(0, 12);
  const filename = `${Date.now()}-${stem}.png`;
  const filepath = path.join(baseDir, filename);
  fs.writeFileSync(filepath, Buffer.from(b64, 'base64'));

  const publicUrl = subdir
    ? `/uploads/generated/${userKey}/${subdir}/${filename}`
    : `/uploads/generated/${userKey}/${filename}`;
  const [w, h] = size.split('x').map((n) => parseInt(n, 10));
  const costCents = costCentsFor(size, quality);

  // Cache write is best-effort — never block delivery on it.
  try {
    await GeneratedImageCache.create({
      key,
      userId: typeof opts.userId === 'string' ? new mongoose.Types.ObjectId(opts.userId) : opts.userId,
      prompt,
      imageUrl: publicUrl,
      path: filepath,
      width: w,
      height: h,
      size,
      quality,
      costCents,
    });
  } catch {
    // ignore
  }

  return {
    imageUrl: publicUrl,
    filepath,
    width: w,
    height: h,
    costCents,
    cached: false,
  };
}
