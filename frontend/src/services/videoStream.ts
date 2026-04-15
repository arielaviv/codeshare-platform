import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export interface VideoStreamHandlers {
  onStarted(data: { prompt: string; durationSec: number }): void;
  onPromptRefined(data: { refinedPrompt: string }): void;
  onQueued(data: { taskId: string; durationSec: number }): void;
  onProgress(data: { percent: number }): void;
  onReady(data: {
    videoId: string;
    videoUrl: string;
    durationSec: number;
    refinedPrompt: string;
  }): void;
  onFailed(reason: string): void;
  onError(message: string): void;
}

export function streamVideoGeneration(
  req: { prompt: string; durationSec?: 5 | 10; sessionId?: string },
  handlers: VideoStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-video`, {
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
      handlers.onError('Failed to connect to video generator');
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onError('Video generation failed');
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
              case 'video_started': handlers.onStarted(parsed); break;
              case 'prompt_refined': handlers.onPromptRefined(parsed); break;
              case 'runway_queued': handlers.onQueued(parsed); break;
              case 'runway_progress': handlers.onProgress(parsed); break;
              case 'video_ready': handlers.onReady(parsed); break;
              case 'video_failed': handlers.onFailed(parsed.reason || 'Unknown reason'); break;
              case 'error': handlers.onError(parsed.message || 'Unknown error'); break;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();
  return controller;
}
