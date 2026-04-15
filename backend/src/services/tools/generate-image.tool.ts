import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import OpenAI from 'openai';
import type { AgentTool, ToolContext } from './types';
import { GeneratedImageCache } from '../../models/GeneratedImageCache';

interface GenerateImageInput {
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  n?: number;
}

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const UPLOADS_BASE = path.join(__dirname, '../../../uploads/generated');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function cacheKey(prompt: string, size: string, quality: string): string {
  return crypto.createHash('sha256').update(`${prompt}::${size}::${quality}`).digest('hex');
}

function costCentsFor(size: string, quality: string): number {
  // gpt-image-1 retail (per image, USD):
  // low ~$0.011, medium ~$0.042, high ~$0.084-0.092 (size dependent)
  // Pass-through with Polish-tier markup: ×~3 (covers infra + margin).
  const isLandscape = size !== '1024x1024';
  if (quality === 'high') return isLandscape ? 25 : 19;
  if (quality === 'medium') return 10;
  return 5; // low / auto default
}

export const generateImageTool: AgentTool = {
  definition: {
    name: 'generate_image',
    description:
      "Generate an original image using OpenAI gpt-image-1. Use this when the user asks for design work (logo, hero image, illustration, mockup, infographic, artwork). For stock hero photos in apps, prefer fetch_unsplash_image instead. The returned URL can be embedded directly in generated HTML/JSX.",
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed image-generation prompt. Be specific about subject, style, composition, color palette, lighting. Example: "Minimalist logo for a coffee shop named Aurora, dark navy and warm gold, geometric mountain silhouette with a coffee cup formed by negative space, vector style, transparent background."',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
          description:
            'Image dimensions. Square for logos/social, landscape for hero/banner, portrait for posters. Default: 1024x1024.',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'auto'],
          description:
            'Generation quality. Default: medium. Use high only when the user explicitly asks for "best quality" or "premium".',
        },
        n: {
          type: 'number',
          description: 'Number of variations to generate (1-4). Default: 1.',
        },
      },
      required: ['prompt'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { prompt, size = '1024x1024', quality = 'medium', n = 1 } = input as GenerateImageInput;

    if (!prompt || prompt.trim().length === 0) {
      return 'generate_image failed: prompt is required.';
    }

    if (!openaiClient) {
      return 'generate_image failed: OPENAI_API_KEY is not configured. The Design skill is unavailable.';
    }

    const userKey = ctx.userId ? ctx.userId.toString() : 'anonymous';
    const userDir = path.join(UPLOADS_BASE, userKey);
    ensureDir(userDir);

    const key = cacheKey(prompt, size, quality);

    // Cache check
    try {
      const cached = await GeneratedImageCache.findOne({ key });
      if (cached) {
        ctx.writer.send('media_ready', {
          imageUrl: cached.imageUrl,
          path: cached.path,
          width: cached.width,
          height: cached.height,
          prompt,
          model: 'gpt-image-1 (cached)',
        });
        return `Image returned from cache: ${cached.imageUrl}`;
      }
    } catch {
      // Cache miss is fine
    }

    // Tell the frontend we're starting
    ctx.writer.send('media_generating', {
      prompt,
      model: 'gpt-image-1',
    });

    let result;
    try {
      result = await openaiClient.images.generate({
        model: 'gpt-image-1',
        prompt,
        size: size === 'auto' ? '1024x1024' : (size as '1024x1024' | '1536x1024' | '1024x1536'),
        quality: quality === 'auto' ? 'medium' : quality,
        n: Math.max(1, Math.min(4, n)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `generate_image failed: ${message}`;
    }

    if (!result?.data || result.data.length === 0) {
      return 'generate_image failed: OpenAI returned no images.';
    }

    const first = result.data[0];
    const b64 = first.b64_json;
    if (!b64) {
      return 'generate_image failed: response missing b64_json.';
    }

    const filename = `${Date.now()}-${key.slice(0, 12)}.png`;
    const filepath = path.join(userDir, filename);
    fs.writeFileSync(filepath, Buffer.from(b64, 'base64'));

    const publicUrl = `/uploads/generated/${userKey}/${filename}`;
    const [w, h] = size === 'auto'
      ? [1024, 1024]
      : size.split('x').map((n) => parseInt(n, 10));

    // Cache
    try {
      await GeneratedImageCache.create({
        key,
        userId: ctx.userId,
        prompt,
        imageUrl: publicUrl,
        path: filepath,
        width: w,
        height: h,
        size,
        quality,
        costCents: costCentsFor(size, quality),
      });
    } catch {
      // Cache write failure shouldn't block delivery
    }

    ctx.writer.send('media_ready', {
      imageUrl: publicUrl,
      path: filepath,
      width: w,
      height: h,
      prompt,
      model: 'gpt-image-1',
    });

    return [
      `Image generated successfully.`,
      `URL: ${publicUrl}`,
      `Dimensions: ${w}x${h} · quality: ${quality}`,
      `Embed in your generated HTML/JSX as: <img src="${publicUrl}" alt="..." />`,
    ].join('\n');
  },
};
