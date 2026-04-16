import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export interface BookBundleSSEHandlers {
  onStageStarted?(data: { stage: string }): void;
  onZipping?(data: { filename: string }): void;
  onProgress?(data: { pct: number }): void;
  onZipReady?(data: { sizeBytes: number; entries: number }): void;

  onBundleReady(data: {
    bundleUrl: string;
    sizeBytes: number;
    filename: string;
    entries: number;
  }): void;

  onStageComplete?(data: { stage: string; status: string; durationMs: number }): void;
  onError(message: string): void;
}

export interface StreamBookBundleRequest {
  bookId: string;
  sessionId?: string;
}

export function streamBookBundle(
  req: StreamBookBundleRequest,
  handlers: BookBundleSSEHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/bundle-book`, {
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
      handlers.onError('Failed to connect to bundler');
      return;
    }

    if (!response.ok || !response.body) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(body) as { message?: string }; } catch { /* not json */ }
      handlers.onError(`Bundle failed (${response.status}): ${parsed.message || body.slice(0, 200)}`);
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
              case 'stage_started':   handlers.onStageStarted?.(parsed); break;
              case 'bundle.zipping':  handlers.onZipping?.(parsed); break;
              case 'bundle.progress': handlers.onProgress?.(parsed); break;
              case 'bundle.zip_ready': handlers.onZipReady?.(parsed); break;
              case 'bundle_ready':    handlers.onBundleReady(parsed); break;
              case 'stage_complete':  handlers.onStageComplete?.(parsed); break;
              case 'error':           handlers.onError(parsed.message || 'Bundler error'); break;
              default: break;
            }
          } catch {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();

  return controller;
}
