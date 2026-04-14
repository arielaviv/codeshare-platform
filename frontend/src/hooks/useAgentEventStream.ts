import { useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';
import type { AgentSSEEventMap, AgentSSEEventName } from '../types/agent-events';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export type AgentStreamEvent = {
  [K in AgentSSEEventName]: { event: K; data: AgentSSEEventMap[K] };
}[AgentSSEEventName];

export interface UseAgentEventStreamOptions {
  onEvent: (event: AgentStreamEvent) => void;
  onConnectionError?: (message: string) => void;
  onRequestError?: (status: number) => void;
}

export interface UseAgentEventStreamResult {
  start: (
    messages: ChatMessage[],
    workspace: Record<string, string>,
    model?: string,
  ) => AbortController;
  abort: () => void;
}

interface ParsedSSEPart {
  event: string;
  data: string;
}

function parseSSEPart(part: string): ParsedSSEPart {
  const lines = part.split('\n');
  let event = '';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data = line.slice(6);
  }
  return { event, data };
}

const KNOWN_EVENTS: Set<AgentSSEEventName> = new Set([
  'text_delta',
  'file_write',
  'file_delete',
  'tool_call',
  'tool_result',
  'prize_awarded',
  'error',
  'done',
  'plan_proposed',
  'plan_accepted',
  'plan_rejected',
  'price_quoted',
  'delivery_status',
  'slot_spin_triggered',
  'powerup_gifted',
  'feature_proposed',
  'profile_updated',
]);

export function useAgentEventStream(
  options: UseAgentEventStreamOptions,
): UseAgentEventStreamResult {
  const { onEvent, onConnectionError, onRequestError } = options;
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(
    (
      messages: ChatMessage[],
      workspace: Record<string, string>,
      model?: string,
    ): AbortController => {
      const controller = new AbortController();
      controllerRef.current = controller;

      (async () => {
        const token = localStorage.getItem('accessToken');

        let response: Response;
        try {
          response = await fetch(`${API_URL}/ai/agent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ messages, workspace, ...(model ? { model } : {}) }),
            signal: controller.signal,
          });
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          onConnectionError?.('Failed to connect to agent');
          return;
        }

        if (!response.ok) {
          onRequestError?.(response.status);
          return;
        }

        if (!response.body) {
          onConnectionError?.('No response body');
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
              const { event, data } = parseSSEPart(part);
              if (!event || !data) continue;
              if (!KNOWN_EVENTS.has(event as AgentSSEEventName)) continue;
              try {
                const parsed = JSON.parse(data) as AgentSSEEventMap[AgentSSEEventName];
                onEvent({ event, data: parsed } as AgentStreamEvent);
              } catch {
                // skip malformed events
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            onConnectionError?.('Stream disconnected');
          }
        }
      })();

      return controller;
    },
    [onEvent, onConnectionError, onRequestError],
  );

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  return { start, abort };
}
