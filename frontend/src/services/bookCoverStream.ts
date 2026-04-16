import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type BookTitleTreatment =
  | 'bold-sans'
  | 'serif-elegant'
  | 'display-script'
  | 'condensed-tall'
  | 'distressed'
  | 'modern-mono';

export type BookTitlePosition = 'top' | 'center' | 'bottom';

export interface BookCoverVariantBrief {
  idx: number;
  conceptName: string;
  titleTreatment: BookTitleTreatment;
  titlePosition: BookTitlePosition;
  titleColor: string;
  authorColor: string;
  paletteHexes: string[];
}

export interface BookCoverReady extends BookCoverVariantBrief {
  imageUrl: string;
  brief: string;
}

export interface BookCoverStreamHandlers {
  onBookLoaded(data: { bookId: string; title: string; author: string | null; genre: string; tone: string }): void;
  onBriefingStarted?(data: { bookCount: number }): void;
  onBriefsReady?(data: { count: number; variants: BookCoverVariantBrief[] }): void;
  onCoverGenerating(data: { idx: number; conceptName: string }): void;
  onCoverReady(data: BookCoverReady): void;
  onCoverFailed?(data: { idx: number; conceptName: string; message: string }): void;
  onSandboxSynced?(data: { fileCount: number }): void;
  onSandboxSyncFailed?(data: { message: string }): void;
  onCoversComplete(data: { bookId: string; successCount?: number; failedCount?: number; regeneratedIdx?: number }): void;
  onError(message: string): void;
}

export function streamBookCoverGeneration(
  req: { bookId: string; regenerateIdx?: number; author?: string; sessionId?: string },
  handlers: BookCoverStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-book-cover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError('Failed to connect to cover generator');
      return;
    }
    if (!response.ok || !response.body) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // ignore
      }
      let parsed: { message?: string } = {};
      try {
        parsed = JSON.parse(body) as { message?: string };
      } catch {
        // not json
      }
      const detail = parsed.message || body.slice(0, 200) || 'no body';
      handlers.onError(`Cover generation failed (${response.status}): ${detail}`);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let event = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!event || !data) continue;
          try {
            const parsed = JSON.parse(data);
            switch (event) {
              case 'book_loaded':        handlers.onBookLoaded(parsed); break;
              case 'briefing_started':   handlers.onBriefingStarted?.(parsed); break;
              case 'briefs_ready':       handlers.onBriefsReady?.(parsed); break;
              case 'cover_generating':   handlers.onCoverGenerating(parsed); break;
              case 'cover_ready':        handlers.onCoverReady(parsed); break;
              case 'cover_failed':       handlers.onCoverFailed?.(parsed); break;
              case 'sandbox_synced':     handlers.onSandboxSynced?.(parsed); break;
              case 'sandbox_sync_failed':handlers.onSandboxSyncFailed?.(parsed); break;
              case 'covers_complete':    handlers.onCoversComplete(parsed); break;
              case 'error':              handlers.onError(parsed.message || 'Unknown error'); break;
            }
          } catch {
            // ignore malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();
  return controller;
}
