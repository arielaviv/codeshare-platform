import type { ChatMessage, AgentSSEHandlers } from '../types';
import { getApiBase } from '../lib/apiBase';
import { VERIFY_EVENTS } from '../types/verify-events.const';

const API_URL = getApiBase();

export function streamAgent(
  messages: ChatMessage[],
  workspace: Record<string, string>,
  handlers: AgentSSEHandlers,
  model?: string,
  options?: {
    chatOnly?: boolean;
    intent?: string;
    needsResearch?: boolean;
    researchQuery?: string;
  },
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
        body: JSON.stringify({
          messages,
          workspace,
          ...(model ? { model } : {}),
          ...(options?.chatOnly ? { chatOnly: true } : {}),
          ...(options?.intent ? { intent: options.intent } : {}),
          ...(options?.needsResearch ? { needsResearch: true } : {}),
          ...(options?.researchQuery ? { researchQuery: options.researchQuery } : {}),
        }),
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
      handlers.onError(`Agent request failed (${response.status}): ${detail}`);
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
                handlers.onToolCall(parsed.name, parsed.input || {}, parsed.toolCallId);
                break;
              case 'tool_result':
                handlers.onToolResult(parsed.name, parsed.preview || '', parsed.toolCallId);
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
                  toolCallId: parsed.toolCallId,
                  prompt: parsed.prompt,
                  model: parsed.model,
                });
                break;
              case 'media_ready':
                handlers.onMediaReady?.({
                  toolCallId: parsed.toolCallId,
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
              case 'images_fetched':
                handlers.onImagesFetched?.({
                  toolCallId: parsed.toolCallId,
                  query: parsed.query,
                  orientation: parsed.orientation,
                  images: parsed.images || [],
                });
                break;
              case VERIFY_EVENTS.STARTED:
                handlers.onVerifyStarted?.({
                  toolCallId: parsed.toolCallId,
                  fileCount: parsed.fileCount,
                  port: parsed.port,
                });
                break;
              case VERIFY_EVENTS.INSTALL_LOG:
                handlers.onVerifyInstallLog?.({
                  toolCallId: parsed.toolCallId,
                  exitCode: parsed.exitCode,
                  tail: parsed.tail,
                });
                break;
              case VERIFY_EVENTS.SCREENSHOT:
                handlers.onVerifyScreenshot?.({
                  toolCallId: parsed.toolCallId,
                  imageUrl: parsed.imageUrl,
                });
                break;
              case VERIFY_EVENTS.DONE:
                handlers.onVerifyDone?.({
                  toolCallId: parsed.toolCallId,
                  matches: Boolean(parsed.matches),
                  issues: parsed.issues || [],
                  summary: parsed.summary || '',
                  screenshotUrl: parsed.screenshotUrl,
                });
                break;
              case 'error': {
                const msg = parsed.message || 'Unknown error';
                const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
                handlers.onError(reason ? `${msg}: ${reason}` : msg);
                break;
              }
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
