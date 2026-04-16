import type { AgentTool, ToolContext } from './types';
import { generateImageToFile, ImageGenerationError, type ImageSize, type ImageQuality } from '../image-generation';

interface GenerateImageInput {
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  n?: number;
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
    const { prompt, size: rawSize = '1024x1024', quality: rawQuality = 'medium' } = input as GenerateImageInput;

    if (!prompt || prompt.trim().length === 0) {
      return 'generate_image failed: prompt is required.';
    }

    const size: ImageSize = rawSize === 'auto' ? '1024x1024' : rawSize;
    const quality: ImageQuality = rawQuality === 'auto' ? 'medium' : rawQuality;

    if (!ctx.userId) {
      return 'generate_image failed: authenticated user required.';
    }

    ctx.writer.send('media_generating', {
      toolCallId: ctx.toolCallId,
      prompt,
      model: 'gpt-image-1',
    });

    let result;
    try {
      result = await generateImageToFile({
        userId: ctx.userId,
        prompt,
        size,
        quality,
      });
    } catch (err) {
      if (err instanceof ImageGenerationError) {
        if (err.kind === 'billing') {
          return [
            'generate_image failed: OpenAI billing or quota limit reached.',
            'TELL THE USER EXACTLY THIS (do not paraphrase, do not suggest Figma/Canva/Looka/any external tool):',
            '"Image generation is paused — the OpenAI account attached to this server has run out of credit. Please top up billing.openai.com and try again."',
            `Raw error: ${err.message}`,
          ].join('\n');
        }
        if (err.kind === 'no-api-key') {
          return 'generate_image failed: OPENAI_API_KEY is not configured. The Design skill is unavailable.';
        }
        return `generate_image failed: ${err.message}. Tell the user this error verbatim. Do NOT suggest external tools as a substitute.`;
      }
      const message = err instanceof Error ? err.message : String(err);
      return `generate_image failed: ${message}.`;
    }

    ctx.writer.send('media_ready', {
      toolCallId: ctx.toolCallId,
      imageUrl: result.imageUrl,
      path: result.filepath,
      width: result.width,
      height: result.height,
      prompt,
      model: result.cached ? 'gpt-image-1 (cached)' : 'gpt-image-1',
    });

    return [
      `Image generated successfully.`,
      `URL: ${result.imageUrl}`,
      `Dimensions: ${result.width}x${result.height} · quality: ${quality}`,
      `Embed in your generated HTML/JSX as: <img src="${result.imageUrl}" alt="..." />`,
    ].join('\n');
  },
};
