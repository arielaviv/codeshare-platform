import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type BookDraftStage = 'voice-check' | 'remaining' | 'regenerate-chapter';

export interface BookAgentSSEHandlers {
  onStarted(data: { bookId: string; stage: BookDraftStage; iterationCap: number }): void;
  onTextDelta(text: string): void;
  onToolCall(data: { toolUseId: string; name: string; input: unknown }): void;
  onToolResult(data: { toolUseId: string; name: string; ok: boolean; summary: string }): void;
  onChapterStreaming(data: { n: number; delta: string; toolUseId?: string }): void;
  onChapterReady(data: { n: number; path: string; wordCount: number }): void;
  onApprovalRequired(data: {
    approvalId: string;
    gate: string;
    prompt: string;
    options: string[];
    toolCallId?: string;
  }): void;
  onStageComplete(data: { stage: string; status: string; summary?: string; toolCallId?: string }): void;
  onError(message: string): void;
  onDone(data: { iterations: number; durationMs: number }): void;
}

export function streamBookAgent(
  req: {
    bookId: string;
    stage: BookDraftStage;
    chapterN?: number;
    directive?: string;
    sessionId?: string;
  },
  handlers: BookAgentSSEHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem('accessToken');

    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/draft-book`, {
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
      handlers.onError('Failed to connect to book drafter');
      return;
    }

    if (response.status === 401) {
      handlers.onError('Session expired. Please log in again.');
      window.location.href = '/login';
      return;
    }
    if (response.status === 429) {
      handlers.onError('Rate limit reached. Try again in a bit.');
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
        // not JSON
      }
      const detail = parsed.message || body.slice(0, 200) || 'no body';
      handlers.onError(`Book drafting failed (${response.status}): ${detail}`);
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
              case 'book_agent_started':
                handlers.onStarted(parsed);
                break;
              case 'text_delta':
                handlers.onTextDelta(typeof parsed.text === 'string' ? parsed.text : '');
                break;
              case 'tool_call':
                handlers.onToolCall(parsed);
                break;
              case 'tool_result':
                handlers.onToolResult(parsed);
                break;
              case 'draft.chapter_streaming':
                handlers.onChapterStreaming(parsed);
                break;
              case 'draft.chapter_ready':
                handlers.onChapterReady(parsed);
                break;
              case 'approval_required':
                handlers.onApprovalRequired(parsed);
                break;
              case 'stage_complete':
                handlers.onStageComplete(parsed);
                break;
              case 'error':
                handlers.onError(parsed.message || 'Unknown error');
                break;
              case 'done':
                handlers.onDone(parsed);
                break;
              default:
                // Unrecognized events are ignored — the tool_result side-effect
                // channels (like book_persist_error) are observability-only and
                // can be added to the handler union as needed.
                break;
            }
          } catch {
            // Malformed JSON — skip.
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
