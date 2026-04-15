import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export interface AudioStreamHandlers {
  onStarted(data: { prompt: string }): void;
  onScriptDrafted(data: { text: string }): void;
  onTtsGenerating(data: { voiceId: string; voiceName: string; charCount: number }): void;
  onReady(data: {
    audioId: string;
    audioUrl: string;
    durationSec: number;
    voiceName: string;
    scriptText: string;
  }): void;
  onError(message: string): void;
}

export function streamAudioGeneration(
  req: { prompt: string; scriptText?: string; voiceId?: string; sessionId?: string },
  handlers: AudioStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-audio`, {
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
      handlers.onError('Failed to connect to audio generator');
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onError('Audio generation failed');
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
              case 'audio_started': handlers.onStarted(parsed); break;
              case 'script_drafted': handlers.onScriptDrafted(parsed); break;
              case 'tts_generating': handlers.onTtsGenerating(parsed); break;
              case 'audio_ready': handlers.onReady(parsed); break;
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
