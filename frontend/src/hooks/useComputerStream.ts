import { useCallback, useRef } from 'react';
import { useComputer } from '../contexts/ComputerContext';
import type { ChatMessage } from '../types';

import { getApiBase } from '../lib/apiBase';
const API_URL = getApiBase();

export interface ComputerStreamOptions {
  messages: ChatMessage[];
  workspace?: Record<string, string>;
  model?: string;
  onTextDelta?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

interface ParsedEvent {
  event: string;
  data: unknown;
}

function parseSSEChunk(buffer: string): { events: ParsedEvent[]; remainder: string } {
  const events: ParsedEvent[] = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';
  for (const part of parts) {
    const lines = part.split('\n');
    let eventName = 'message';
    let dataRaw = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataRaw += line.slice(6);
    }
    if (!dataRaw) continue;
    try {
      events.push({ event: eventName, data: JSON.parse(dataRaw) });
    } catch {
      events.push({ event: eventName, data: dataRaw });
    }
  }
  return { events, remainder };
}

interface BrowserStartPayload {
  executionId: string;
  streamUrl: string;
}
interface BrowserActionPayload {
  executionId: string;
  action: string;
  target: string;
  url?: string;
  title?: string;
  timestamp: number;
}
interface BrowserEndPayload {
  executionId: string;
}
interface CodeExecutionStartPayload {
  executionId: string;
  code: string;
  language: 'python';
  description?: string;
}
interface CodeExecutionResultPayload {
  executionId: string;
  status: 'success' | 'error';
  stdout: string[];
  stderr: string[];
  error?: { name: string; value: string; traceback: string };
  results: Array<{ png?: string; svg?: string; html?: string; text?: string }>;
  outputFiles: Array<{ path: string; format: string; sizeBytes: number }>;
  durationMs: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function useComputerStream(): {
  start: (options: ComputerStreamOptions) => AbortController;
  isRunning: () => boolean;
} {
  const { dispatch } = useComputer();
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(
    (options: ComputerStreamOptions): AbortController => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      (async () => {
        const token = localStorage.getItem('accessToken');
        let response: Response;
        try {
          response = await fetch(`${API_URL}/ai/computer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              messages: options.messages,
              workspace: options.workspace ?? {},
              ...(options.model ? { model: options.model } : {}),
            }),
            signal: controller.signal,
          });
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          options.onError?.("Failed to connect to Mr8's Computer.");
          options.onDone?.();
          return;
        }

        if (response.status === 401) {
          options.onError?.('Session expired. Please log in again.');
          options.onDone?.();
          window.location.href = '/login';
          return;
        }
        if (response.status === 429) {
          options.onError?.("Mr8's Computer rate limit reached. Try again later.");
          options.onDone?.();
          return;
        }
        if (!response.ok || !response.body) {
          options.onError?.("Mr8's Computer request failed.");
          options.onDone?.();
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
            const { events, remainder } = parseSSEChunk(buffer);
            buffer = remainder;

            for (const evt of events) {
              const data = evt.data;
              switch (evt.event) {
                case 'browser-start':
                  if (isRecord(data)) {
                    const p = data as unknown as BrowserStartPayload;
                    dispatch({ type: 'browser-start', id: p.executionId, streamUrl: p.streamUrl });
                  }
                  break;
                case 'browser-action':
                  if (isRecord(data)) {
                    const p = data as unknown as BrowserActionPayload;
                    dispatch({
                      type: 'browser-action',
                      id: p.executionId,
                      action: p.action,
                      target: p.target,
                      url: p.url,
                      title: p.title,
                    });
                  }
                  break;
                case 'browser-end':
                  if (isRecord(data)) {
                    const p = data as unknown as BrowserEndPayload;
                    dispatch({ type: 'browser-end', id: p.executionId });
                  }
                  break;
                case 'code-execution-start':
                  if (isRecord(data)) {
                    const p = data as unknown as CodeExecutionStartPayload;
                    dispatch({
                      type: 'python-start',
                      id: p.executionId,
                      code: p.code,
                      description: p.description,
                    });
                  }
                  break;
                case 'code-execution-result':
                  if (isRecord(data)) {
                    const p = data as unknown as CodeExecutionResultPayload;
                    dispatch({
                      type: 'python-result',
                      id: p.executionId,
                      status: p.status,
                      stdout: p.stdout,
                      stderr: p.stderr,
                      error: p.error,
                      results: p.results,
                      outputFiles: p.outputFiles,
                      durationMs: p.durationMs,
                    });
                  }
                  break;
                case 'text_delta':
                  if (isRecord(data) && typeof data.text === 'string') {
                    options.onTextDelta?.(data.text);
                  }
                  break;
                case 'error':
                  if (isRecord(data) && typeof data.message === 'string') {
                    options.onError?.(data.message);
                  }
                  break;
                case 'done':
                  options.onDone?.();
                  break;
                default:
                  break;
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            options.onError?.((err as Error).message);
          }
        } finally {
          options.onDone?.();
        }
      })();

      return controller;
    },
    [dispatch]
  );

  const isRunning = useCallback(() => {
    return controllerRef.current != null && !controllerRef.current.signal.aborted;
  }, []);

  return { start, isRunning };
}
