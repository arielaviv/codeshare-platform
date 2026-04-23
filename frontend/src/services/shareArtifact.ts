/**
 * shareArtifact — single entry point every product module uses to publish
 * an AI-generated artifact to the public feed. Lives in one place so the
 * POST /api/posts payload shape stays consistent across kinds, and so the
 * feed's FeedCard can rely on the same `kind` + `thumbnail` + `meta` shape
 * to render a card matching what Mr8 showed at completion.
 */
import api from './api';
import type { ResearchBrief } from '../types/deck';

export type ShareableArtifact =
  | {
      kind: 'code-app';
      projectName: string;
      files: Record<string, string>;
      description?: string;
    }
  | {
      kind: 'deck';
      deckId: string;
      title: string;
      slideCount: number;
      firstSlide?: {
        title: string;
        subtitle?: string;
        bulletCount?: number;
        slideType?: string;
      };
    }
  | {
      kind: 'book';
      bookId: string;
      title: string;
      author?: string;
      coverImageUrl?: string;
      bundleUrl?: string;
      bundleSizeBytes?: number;
      wordCount?: number;
    }
  | {
      kind: 'video';
      videoUrl: string;
      durationSec: number;
      refinedPrompt?: string;
      title?: string;
    }
  | {
      kind: 'audio';
      audioUrl: string;
      durationSec: number;
      voiceName: string;
      scriptText: string;
      title?: string;
      audioKind?: 'tts' | 'sfx' | 'music';
    }
  | {
      kind: 'image';
      imageUrl: string;
      prompt: string;
      width?: number;
      height?: number;
    }
  | {
      kind: 'visualization';
      imageUrl: string;
      chartKind?: string;
      code?: string;
      title?: string;
    }
  | {
      kind: 'spreadsheet';
      title: string;
      xlsxUrl?: string;
      sheetsMeta: Array<{ name: string; rows: number; cols: number }>;
    }
  | {
      kind: 'research';
      brief: ResearchBrief;
    };

export function artifactLabel(a: ShareableArtifact): string {
  switch (a.kind) {
    case 'code-app':     return a.projectName || 'app';
    case 'deck':         return a.title || 'deck';
    case 'book':         return a.title || 'book';
    case 'video':        return a.title || 'video';
    case 'audio':        return a.title ?? (a.audioKind === 'music' ? 'music' : a.audioKind === 'sfx' ? 'sound effect' : 'audio');
    case 'image':        return 'image';
    case 'visualization':return a.title || 'chart';
    case 'spreadsheet':  return a.title || 'spreadsheet';
    case 'research':     return a.brief.query ? `research on "${a.brief.query}"` : 'research brief';
  }
}

interface SharePayload {
  title: string;
  description: string;
  /** Only set for 'snippet' / 'code-app' kinds — others leave defaults. */
  code?: string;
  language?: string;
  artifactRef?: string;
  thumbnail?: string;
  meta?: Record<string, unknown>;
  files?: Record<string, string>;
}

/** Per-kind payload builder. Defaults for `code`/`language` come from the
 *  dispatcher below — don't repeat empty-string fields here. */
function payloadFor(a: ShareableArtifact): SharePayload {
  switch (a.kind) {
    case 'code-app': {
      const main =
        a.files['src/App.tsx'] ||
        a.files['index.html'] ||
        Object.values(a.files)[0] ||
        '';
      const language = a.files['src/App.tsx']
        ? 'typescript'
        : a.files['index.html']
          ? 'html'
          : 'text';
      return {
        title: a.projectName || 'Generated App',
        description: a.description ?? 'Built with Mr8 AI',
        code: main.slice(0, 10000),
        language,
        files: a.files,
      };
    }
    case 'deck':
      return {
        title: a.title,
        description: `Deck · ${a.slideCount} slides`,
        artifactRef: a.deckId,
        meta: { slideCount: a.slideCount, firstSlide: a.firstSlide },
      };
    case 'book':
      return {
        title: a.title,
        description: a.author ? `Book by ${a.author}` : 'Book',
        artifactRef: a.bookId,
        thumbnail: a.coverImageUrl,
        meta: {
          author: a.author,
          bundleUrl: a.bundleUrl,
          bundleSizeBytes: a.bundleSizeBytes,
          wordCount: a.wordCount,
          coverImageUrl: a.coverImageUrl,
        },
      };
    case 'video':
      return {
        title: a.title ?? 'Generated video',
        description: a.refinedPrompt ?? `${a.durationSec}s video`,
        artifactRef: a.videoUrl,
        thumbnail: a.videoUrl,
        meta: {
          videoUrl: a.videoUrl,
          durationSec: a.durationSec,
          refinedPrompt: a.refinedPrompt,
        },
      };
    case 'audio': {
      const fallbackTitle = a.audioKind === 'music' ? 'Generated music' : a.audioKind === 'sfx' ? 'Sound effect' : 'Generated audio';
      return {
        title: a.title ?? fallbackTitle,
        description: a.scriptText.slice(0, 500),
        artifactRef: a.audioUrl,
        thumbnail: a.audioUrl,
        meta: {
          audioUrl: a.audioUrl,
          durationSec: a.durationSec,
          voiceName: a.voiceName,
          scriptText: a.scriptText.slice(0, 2000),
          audioKind: a.audioKind ?? 'tts',
        },
      };
    }
    case 'image':
      return {
        title: a.prompt.slice(0, 80) || 'Generated image',
        description: a.prompt.slice(0, 500),
        artifactRef: a.imageUrl,
        thumbnail: a.imageUrl,
        meta: { imageUrl: a.imageUrl, prompt: a.prompt, width: a.width, height: a.height },
      };
    case 'visualization':
      return {
        title: a.title || 'Visualization',
        description: a.chartKind ? `${a.chartKind} chart` : 'Chart',
        artifactRef: a.imageUrl,
        thumbnail: a.imageUrl,
        meta: { imageUrl: a.imageUrl, chartKind: a.chartKind, code: a.code?.slice(0, 2000) },
      };
    case 'spreadsheet': {
      const first = a.sheetsMeta[0];
      const desc = first
        ? `${a.sheetsMeta.length} sheet${a.sheetsMeta.length === 1 ? '' : 's'} · ${first.rows}×${first.cols}`
        : 'Spreadsheet';
      return {
        title: a.title || 'Spreadsheet',
        description: desc,
        artifactRef: a.xlsxUrl,
        meta: { xlsxUrl: a.xlsxUrl, sheetsMeta: a.sheetsMeta },
      };
    }
    case 'research':
      return {
        title: `Research: ${a.brief.query}`.slice(0, 200),
        description: a.brief.summary.slice(0, 1000),
        meta: {
          query: a.brief.query,
          summary: a.brief.summary,
          keyFacts: a.brief.keyFacts.slice(0, 8),
          sources: a.brief.sources.slice(0, 8).map((s) => ({
            url: s.url,
            title: s.title,
            snippet: s.snippet?.slice(0, 200),
          })),
        },
      };
  }
}

/** 4 MB — total serialized size of `files` for code-app shares. Keeps
 *  generated apps well under MongoDB's 16 MB doc limit once wrapped in a
 *  Post, and keeps the FormData body reasonable on school-server uploads. */
const FILES_MAX_BYTES = 4 * 1024 * 1024;

class ShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareError';
  }
}

/** POST /api/posts for any shareable artifact. Throws on failure. */
export async function shareArtifact(a: ShareableArtifact): Promise<{ _id: string }> {
  const payload = payloadFor(a);

  if (payload.files) {
    const size = JSON.stringify(payload.files).length;
    if (size > FILES_MAX_BYTES) {
      throw new ShareError(
        `Project is too large to share (${(size / 1024 / 1024).toFixed(1)} MB). Delete unused files and try again.`
      );
    }
  }

  const form = new FormData();
  form.append('kind', a.kind);
  form.append('title', payload.title);
  form.append('code', payload.code ?? '');
  form.append('language', payload.language ?? 'text');
  form.append('description', payload.description);
  if (payload.artifactRef) form.append('artifactRef', payload.artifactRef);
  if (payload.thumbnail) form.append('thumbnail', payload.thumbnail);
  if (payload.meta) form.append('meta', JSON.stringify(payload.meta));
  if (payload.files) form.append('files', JSON.stringify(payload.files));

  const { data } = await api.post('/posts', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return { _id: data?.post?._id ?? '' };
}
