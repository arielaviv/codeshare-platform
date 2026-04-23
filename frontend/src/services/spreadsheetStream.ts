import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type SheetPalette = 'gartner-blue' | 'gartner-warm' | 'light' | 'dark' | 'emerald' | 'slate';

export type CellRole = 'header' | 'section' | 'label' | 'data' | 'subtotal' | 'total' | 'blank';

export type CellFormat = 'text' | 'number' | 'integer' | 'currency' | 'percent';

export interface SheetTheme {
  palette: SheetPalette;
  accentColor: string;
  headerBg?: string;
  headerFg?: string;
  sectionBg?: string;
  sectionFg?: string;
  subtotalBg?: string;
  totalBg?: string;
  zebra?: boolean;
}

export interface RichCell {
  value: string;
  formula?: string;
  role?: CellRole;
  format?: CellFormat;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface PythonExecutionStart {
  executionId: string;
  code: string;
  language: string;
  description?: string;
}

export interface PythonExecutionResult {
  executionId: string;
  status: 'success' | 'error';
  stdout: string[];
  stderr: string[];
  error?: { name: string; value: string; traceback: string };
  results: Array<{ png?: string; svg?: string; html?: string; text?: string }>;
  outputFiles: Array<{ path: string; format: string; sizeBytes: number }>;
  durationMs: number;
}

export interface SpreadsheetStreamHandlers {
  onStarted(data: { topic: string; model?: string }): void;
  onTheme(data: { theme: SheetTheme }): void;
  onSheetMeta(data: {
    index: number;
    name: string;
    rowCount: number;
    frozenRows?: number;
    frozenCols?: number;
    theme?: SheetTheme;
  }): void;
  onSheetRow(data: {
    sheetIndex: number;
    rowIndex: number;
    cells: string[];
    richCells?: RichCell[];
  }): void;
  onCompleted(data: {
    sheetId: string;
    title: string;
    sheetCount: number;
    theme?: SheetTheme;
    xlsxUrl?: string;
  }): void;
  onPythonStart?(data: PythonExecutionStart): void;
  onPythonResult?(data: PythonExecutionResult): void;
  onXlsxReady?(data: { xlsxUrl: string; sizeBytes: number; durationMs: number }): void;
  onXlsxFailed?(data: { message: string }): void;
  onError(message: string): void;
}

export function streamSpreadsheetGeneration(
  req: { topic: string; sheetCount?: number; style?: 'simple' | 'detailed'; sessionId?: string; model?: string },
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
              case 'sheet_theme':
                handlers.onTheme(parsed);
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
              case 'code-execution-start':
                handlers.onPythonStart?.(parsed);
                break;
              case 'code-execution-result':
                handlers.onPythonResult?.(parsed);
                break;
              case 'sheet_xlsx_ready':
                handlers.onXlsxReady?.(parsed);
                break;
              case 'sheet_xlsx_failed':
                handlers.onXlsxFailed?.(parsed);
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
