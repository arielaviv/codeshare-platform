import type { ChatMessage, AgentSSEHandlers } from '../types';
import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export function streamAgent(
  messages: ChatMessage[],
  workspace: Record<string, string>,
  handlers: AgentSSEHandlers,
  model?: string,
): AbortController {
  const controller = new AbortController();

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
      handlers.onError('Failed to connect to agent');
      handlers.onDone([]);
      return;
    }

    if (response.status === 401) {
      handlers.onError('Session expired. Please log in again.');
      handlers.onDone([]);
      window.location.href = '/login';
      return;
    }

    if (response.status === 429) {
      handlers.onError('Rate limit reached. Try again later.');
      handlers.onDone([]);
      return;
    }

    if (!response.ok || !response.body) {
      handlers.onError('Agent request failed');
      handlers.onDone([]);
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
              case 'file_write':
                handlers.onFileWrite(parsed.path, parsed.content);
                break;
              case 'file_delete':
                handlers.onFileDelete(parsed.path);
                break;
              case 'tool_call':
                handlers.onToolCall(parsed.name, parsed.input || {});
                break;
              case 'tool_result':
                handlers.onToolResult(parsed.name, parsed.preview || '');
                break;
              case 'prize_awarded':
                handlers.onPrizeAwarded?.({
                  amountCents: parsed.amountCents,
                  newBalanceCents: parsed.newBalanceCents,
                  reason: parsed.reason || '',
                });
                break;
              case 'plan_proposed':
                handlers.onPlanProposed?.({
                  planId: parsed.planId,
                  plan: parsed.plan,
                  pricing: parsed.pricing,
                });
                break;
              case 'delivery_status':
                handlers.onDeliveryStatus?.({
                  planId: parsed.planId || '',
                  status: parsed.status,
                  attempt: parsed.attempt ?? 1,
                  reason: parsed.reason,
                });
                break;
              case 'goal_started':
                handlers.onGoalStarted?.({
                  goalId: parsed.goalId,
                  title: parsed.title,
                  plannedActions: parsed.plannedActions || [],
                });
                break;
              case 'goal_completed':
                handlers.onGoalCompleted?.({
                  summary: parsed.summary,
                  status: parsed.status || 'done',
                });
                break;
              case 'media_generating':
                handlers.onMediaGenerating?.({
                  prompt: parsed.prompt,
                  model: parsed.model,
                });
                break;
              case 'media_ready':
                handlers.onMediaReady?.({
                  imageUrl: parsed.imageUrl,
                  path: parsed.path,
                  width: parsed.width,
                  height: parsed.height,
                  prompt: parsed.prompt,
                  model: parsed.model,
                });
                break;
              case 'follow_ups_proposed':
                handlers.onFollowUpsProposed?.({
                  suggestions: parsed.suggestions || [],
                });
                break;
              case 'error':
                handlers.onError(parsed.message || 'Unknown error');
                break;
              case 'done':
                handlers.onDone(parsed.filesModified || []);
                break;
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError('Stream disconnected');
        handlers.onDone([]);
      }
    }
  })();

  return controller;
}
