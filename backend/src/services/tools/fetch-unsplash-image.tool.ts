import crypto from 'crypto';
import type { AgentTool, ToolContext } from './types';
import { ImageSearchCache } from '../../models/ImageSearchCache';

interface FetchUnsplashImageInput {
  query: string;
  orientation?: 'landscape' | 'portrait' | 'squarish';
  count?: number;
}

interface UnsplashPhoto {
  id: string;
  alt_description: string | null;
  width: number;
  height: number;
  urls: { raw: string; full: string; regular: string; small: string };
  user: { name: string; username: string };
}

const UNSPLASH_API = 'https://api.unsplash.com';

function cacheKey(query: string, orientation: string): string {
  return crypto.createHash('sha256').update(`${query.toLowerCase()}::${orientation}`).digest('hex');
}

export const fetchUnsplashImageTool: AgentTool = {
  definition: {
    name: 'fetch_unsplash_image',
    description:
      "Fetch real Unsplash stock photos to embed in generated apps/websites as hero images, gallery images, or section backgrounds. Use for stock photography (cars, nature, products, people). For original generated artwork (logos, illustrations, mockups), use generate_image instead.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query. Be specific: "porsche gt3 rs on track", "modern coffee shop interior", "tropical beach sunset". Default count is 1.',
        },
        orientation: {
          type: 'string',
          enum: ['landscape', 'portrait', 'squarish'],
          description: 'landscape (16:9 hero), portrait (9:16 mobile), squarish (1:1 social/grid). Default: landscape.',
        },
        count: {
          type: 'number',
          description: 'Number of images to return (1-5). Default: 1.',
        },
      },
      required: ['query'],
    },
  },
  async execute(input: unknown): Promise<string> {
    const { query, orientation = 'landscape', count = 1 } = input as FetchUnsplashImageInput;
    if (!query || query.trim().length === 0) {
      return 'fetch_unsplash_image failed: query is required.';
    }

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      // Graceful degradation — return well-known fallback photo IDs so the
      // agent can still produce hero images without API access.
      const fallbacks = [
        '1506744038136-46273834b3fb',
        '1470071459604-3b5ec3a7fe05',
        '1486325212027-8a9601a5e652',
        '1518770660439-4636190af475',
      ];
      const id = fallbacks[Math.abs(hash(query)) % fallbacks.length];
      const url = `https://images.unsplash.com/photo-${id}?w=1600&h=900&fit=crop`;
      return JSON.stringify([
        { id, url, alt: query, author: 'unsplash', width: 1600, height: 900 },
      ]);
    }

    const key = cacheKey(query, orientation);
    try {
      const cached = await ImageSearchCache.findOne({ key });
      if (cached) {
        return JSON.stringify(cached.results.slice(0, Math.max(1, Math.min(5, count))));
      }
    } catch {
      // Cache miss is fine
    }

    let photos: UnsplashPhoto[] = [];
    try {
      const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${Math.max(1, Math.min(5, count))}&content_filter=high`;
      const response = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      });
      if (!response.ok) {
        return `fetch_unsplash_image failed: Unsplash API returned ${response.status}`;
      }
      const body = (await response.json()) as { results: UnsplashPhoto[] };
      photos = body.results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `fetch_unsplash_image failed: ${message}`;
    }

    const results = photos.map((p) => ({
      id: p.id,
      url: `${p.urls.raw}&w=1600&h=900&fit=crop&auto=format`,
      alt: p.alt_description ?? query,
      author: p.user.name,
      width: 1600,
      height: 900,
    }));

    try {
      await ImageSearchCache.create({ key, query, orientation, results });
    } catch {
      // Cache write failure isn't blocking
    }

    return JSON.stringify(results);
  },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
