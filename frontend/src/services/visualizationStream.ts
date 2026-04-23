import { getApiBase } from '../lib/apiBase';
import type { ChartKind } from '../components/visualization/VisualizationPicker';

const API_URL = getApiBase();

export interface VisualizationStreamHandlers {
  onStarted(data: { prompt: string }): void;
  onPythonDrafted(data: { code: string }): void;
  onChartReady(data: { imageUrl: string; chartKind: string; code: string }): void;
  onError(message: string): void;
}

export function streamVisualization(
  req: { prompt: string; preferredCharts?: ChartKind[]; sessionId?: string; model?: string },
  handlers: VisualizationStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-visualization`, {
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
      handlers.onError('Failed to connect to visualization generator');
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onError('Visualization generation failed');
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
              case 'viz_started': handlers.onStarted(parsed); break;
              case 'viz_python_drafted': handlers.onPythonDrafted(parsed); break;
              case 'viz_chart_ready': handlers.onChartReady(parsed); break;
              case 'error': handlers.onError(parsed.message || 'Unknown error'); break;
              // code-execution-* events fly past — the viz card doesn't render them
              default: break;
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
