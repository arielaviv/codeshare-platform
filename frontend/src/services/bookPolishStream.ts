import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type EditAggressiveness = 'light' | 'standard' | 'heavy';

export interface AuditIssue {
  kind: 'character' | 'timeline' | 'setting' | 'name' | 'tone' | 'continuity';
  chapterRange: number[];
  description: string;
  suggestedFix: string;
  resolved?: boolean;
}

export interface BookPolishSSEHandlers {
  onPipelineStarted(data: { bookId: string; passes: string[] }): void;

  onStageStarted(data: { stage: string; chapterCount?: number }): void;
  onStageComplete(data: { stage: string; status: string; summary?: string }): void;
  onPipelineComplete(data: { bookId: string; durationMs: number }): void;
  onPipelineHalted(data: { pass: string; durationMs: number }): void;

  // Audit events
  onAuditLoadingManuscript?(data: { chapterCount: number }): void;
  onAuditAuditing?(data: { wordCount: number }): void;
  onAuditIssuesReady(data: { bookId: string; issueCount: number; issues: AuditIssue[] }): void;

  // Line edit events
  onLineEditChapterStart?(data: { n: number; title: string }): void;
  onLineEditChapterDone?(data: { n: number; wordCount: number; skippedChunks: number; editedPath: string }): void;
  onLineEditChunkSkipped?(data: { n: number; chunkIdx: number; reason: string }): void;
  onLineEditChunkDone?(data: { n: number; chunkIdx: number; deltaWords: number; voicePreserved: boolean }): void;

  // Copy edit events
  onCopyEditChapterStart?(data: { n: number; title: string }): void;
  onCopyEditChapterDone?(data: { n: number; wordCount: number; fixCount: number; proofedPath: string }): void;
  onCopyEditChunkSkipped?(data: { n: number; chunkIdx: number; reason: string }): void;

  onError(message: string): void;
}

export function streamBookPolish(
  req: { bookId: string; aggressiveness: EditAggressiveness; directives?: string; skipAudit?: boolean; sessionId?: string },
  handlers: BookPolishSSEHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/polish-book`, {
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
      handlers.onError('Failed to connect to editor');
      return;
    }
    if (!response.ok || !response.body) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(body) as { message?: string }; } catch { /* not json */ }
      handlers.onError(`Polish failed (${response.status}): ${parsed.message || body.slice(0, 200)}`);
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
              case 'pipeline_started':        handlers.onPipelineStarted(parsed); break;
              case 'pipeline_complete':       handlers.onPipelineComplete(parsed); break;
              case 'pipeline_halted':         handlers.onPipelineHalted(parsed); break;
              case 'stage_started':           handlers.onStageStarted(parsed); break;
              case 'stage_complete':          handlers.onStageComplete(parsed); break;
              case 'audit.loading_manuscript':handlers.onAuditLoadingManuscript?.(parsed); break;
              case 'audit.auditing':          handlers.onAuditAuditing?.(parsed); break;
              case 'audit.issues_ready':      handlers.onAuditIssuesReady(parsed); break;
              case 'edit.chapter_start':      handlers.onLineEditChapterStart?.(parsed); break;
              case 'edit.chapter_done':       handlers.onLineEditChapterDone?.(parsed); break;
              case 'edit.chunk_skipped':      handlers.onLineEditChunkSkipped?.(parsed); break;
              case 'edit.chunk_done':         handlers.onLineEditChunkDone?.(parsed); break;
              case 'copy.chapter_start':      handlers.onCopyEditChapterStart?.(parsed); break;
              case 'copy.chapter_done':       handlers.onCopyEditChapterDone?.(parsed); break;
              case 'copy.chunk_skipped':      handlers.onCopyEditChunkSkipped?.(parsed); break;
              case 'error':                   handlers.onError(parsed.message || 'Unknown error'); break;
              default: break;
            }
          } catch {
            // malformed event, skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();

  return controller;
}
