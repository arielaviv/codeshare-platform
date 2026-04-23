import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type AudioKind = 'tts' | 'sfx' | 'music';

export interface AudioStreamHandlers {
  onStarted(data: { prompt: string }): void;
  onKind?(data: { kind: AudioKind }): void;
  onScriptDrafted(data: { text: string }): void;
  onTtsGenerating(data: { voiceId: string; voiceName: string; charCount: number }): void;
  onSfxGenerating?(data: { durationSec: number; prompt: string }): void;
  onMusicGenerating?(data: { lengthMs: number; prompt: string }): void;
  onReady(data: {
    audioId: string;
    audioUrl: string;
    durationSec: number;
    voiceName: string;
    scriptText: string;
    kind?: AudioKind;
  }): void;
  onError(message: string): void;
}

export function streamAudioGeneration(
  req: {
    prompt: string;
    scriptText?: string;
    voiceId?: string;
    sessionId?: string;
    kind?: AudioKind;
    sfxDurationSec?: number;
    musicLengthMs?: number;
    model?: string;
  },
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
      handlers.onError(`Audio generation failed (${response.status}): ${detail}`);
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
              case 'audio_kind': handlers.onKind?.(parsed); break;
              case 'script_drafted': handlers.onScriptDrafted(parsed); break;
              case 'tts_generating': handlers.onTtsGenerating(parsed); break;
              case 'sfx_generating': handlers.onSfxGenerating?.(parsed); break;
              case 'music_generating': handlers.onMusicGenerating?.(parsed); break;
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
