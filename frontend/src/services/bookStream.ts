import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export interface BookChapterOutline {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
}

export interface BookOutlineReady {
  bookId: string;
  title: string;
  genre: string;
  tone: string;
  pov: string;
  themes: string[];
  chapters: BookChapterOutline[];
  totalEstimatedWords: number;
  targetWords: number;
}

export interface BookFileWritten {
  path: string;
  content: string;
  sandboxPath?: string;
}

export interface BookStreamHandlers {
  onStarted(data: { prompt: string; targetWords: number }): void;
  onSandboxReady(data: { sandboxId: string }): void;
  onBookCreated(data: { bookId: string }): void;
  onOutlineGenerating(data: { targetWords: number }): void;
  onFileWritten(data: BookFileWritten): void;
  onOutlineReady(data: BookOutlineReady): void;
  onSandboxWriteFailed?(data: { message: string }): void;
  onBookComplete(data: { bookId: string; stage: string; title: string; chapterCount: number }): void;
  onError(message: string): void;
}

export function streamBookGeneration(
  req: { prompt: string; targetWords?: number; sessionId?: string },
  handlers: BookStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-book`, {
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
      handlers.onError('Failed to connect to book generator');
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
      handlers.onError(`Book generation failed (${response.status}): ${detail}`);
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
              case 'book_started':       handlers.onStarted(parsed); break;
              case 'sandbox_ready':      handlers.onSandboxReady(parsed); break;
              case 'book_created':       handlers.onBookCreated(parsed); break;
              case 'outline_generating': handlers.onOutlineGenerating(parsed); break;
              case 'file_written':       handlers.onFileWritten(parsed); break;
              case 'outline_ready':      handlers.onOutlineReady(parsed); break;
              case 'sandbox_write_failed':
                handlers.onSandboxWriteFailed?.(parsed);
                break;
              case 'book_complete':      handlers.onBookComplete(parsed); break;
              case 'error':              handlers.onError(parsed.message || 'Unknown error'); break;
            }
          } catch {
            // ignore malformed event
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();
  return controller;
}
