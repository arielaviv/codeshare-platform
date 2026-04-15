import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export interface SpreadsheetStreamHandlers {
  onStarted(data: { topic: string }): void;
  onSheetMeta(data: { index: number; name: string; rowCount: number }): void;
  onSheetRow(data: { sheetIndex: number; rowIndex: number; cells: string[] }): void;
  onCompleted(data: { sheetId: string; title: string; sheetCount: number }): void;
  onError(message: string): void;
}

export function streamSpreadsheetGeneration(
  req: { topic: string; sheetCount?: number; style?: 'simple' | 'detailed'; sessionId?: string },
  handlers: SpreadsheetStreamHandlers
): AbortController {
  const controller = new AbortController();
  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-spreadsheet`, {
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
      handlers.onError('Failed to connect to spreadsheet generator');
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onError('Spreadsheet generation failed');
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
              case 'sheet_started':
                handlers.onStarted(parsed);
                break;
              case 'sheet_meta':
                handlers.onSheetMeta(parsed);
                break;
              case 'sheet_row':
                handlers.onSheetRow(parsed);
                break;
              case 'sheet_completed':
                handlers.onCompleted(parsed);
                break;
              case 'error':
                handlers.onError(parsed.message || 'Unknown error');
                break;
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
