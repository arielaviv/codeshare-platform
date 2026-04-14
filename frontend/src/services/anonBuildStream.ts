import { API_URL } from './api';

export interface AnonBuildStreamHandlers {
  onTextDelta(content: string): void;
  onToolCall(name: string, input: Record<string, unknown>): void;
  onFileWrite(path: string, content: string): void;
  onDone(data: { buildId: string; filesModified: string[] }): void;
  onError(message: string): void;
}

export function streamAnonBuild(
  prompt: string,
  handlers: AnonBuildStreamHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/anon-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError('Failed to reach Mr8');
      return;
    }

    if (response.status === 429) {
      handlers.onError('You already used your free preview — sign up to keep building.');
      return;
    }
    if (response.status === 400) {
      try {
        const body = await response.json();
        handlers.onError(body.message || 'Invalid prompt');
      } catch {
        handlers.onError('Invalid prompt');
      }
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onError('Build failed to start');
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
              case 'text_delta':
                handlers.onTextDelta(parsed.content || '');
                break;
              case 'tool_call':
                handlers.onToolCall(parsed.name, parsed.input || {});
                break;
              case 'file_write':
                handlers.onFileWrite(parsed.path, parsed.content);
                break;
              case 'done':
                handlers.onDone({
                  buildId: parsed.buildId,
                  filesModified: parsed.filesModified || [],
                });
                break;
              case 'error':
                handlers.onError(parsed.message || 'Stream error');
                break;
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError('Stream disconnected');
      }
    }
  })();

  return controller;
}

export interface AdoptResponse {
  prompt: string;
  files: Record<string, string>;
  assistantText: string;
  awardedCents: number;
  newBalanceCents: number;
}

export async function adoptAnonBuild(
  buildId: string,
  accessToken: string
): Promise<AdoptResponse> {
  const res = await fetch(`${API_URL}/ai/anon-build/${buildId}/adopt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Adopt failed');
  }
  return res.json();
}
