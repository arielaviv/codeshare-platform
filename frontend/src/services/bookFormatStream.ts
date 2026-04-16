import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

export type BookFormatTarget = 'pdf' | 'epub' | 'docx';

export type BookArtifactKind =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'cover-wrap-paperback'
  | 'cover-wrap-hardcover'
  | 'cover-for-epub'
  | 'copyright-cert'
  | 'kdp-guide'
  | 'bundle-zip'
  | 'audiobook'
  | 'translation-pdf'
  | 'translation-epub';

export interface BookBuildArtifact {
  kind: BookArtifactKind;
  sandboxPath: string;
  url: string;
  sizeBytes: number;
  builtAt: string;
  lang?: string;
}

export interface BookFormatSSEHandlers {
  onStageStarted(data: { stage: string; formats: BookFormatTarget[]; themeId: string }): void;
  onPreflight?(data: { chapterCount: number; themeId: string; trimSize: string }): void;

  onToolchainInstalling?(data: Record<string, never>): void;
  onToolchainReady?(data: Record<string, never>): void;

  onStaging?(data: { themeId: string }): void;
  onManuscriptBuilding?(data: Record<string, never>): void;
  onManuscriptReady?(data: { chapters: number; sizeBytes: number }): void;

  onCompositeCover?(data: Record<string, never>): void;
  onCoverReady?(data: { kind: BookArtifactKind; url: string; sizeBytes: number }): void;
  onCoverFailed?(data: { message: string }): void;

  onBuilding(data: { kind: BookArtifactKind }): void;
  onReady(data: { kind: BookArtifactKind; url: string; sizeBytes: number }): void;

  onStageComplete(data: {
    stage: string;
    status: string;
    durationMs: number;
    artifacts: BookBuildArtifact[];
  }): void;

  onError(message: string): void;
}

export interface StreamBookFormatRequest {
  bookId: string;
  formats?: BookFormatTarget[];
  forceReformat?: boolean;
  sessionId?: string;
}

export function streamBookFormat(
  req: StreamBookFormatRequest,
  handlers: BookFormatSSEHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem('accessToken');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/format-book`, {
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
      handlers.onError('Failed to connect to formatter');
      return;
    }

    if (!response.ok || !response.body) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(body) as { message?: string }; } catch { /* not json */ }
      handlers.onError(`Format failed (${response.status}): ${parsed.message || body.slice(0, 200)}`);
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
              case 'stage_started':             handlers.onStageStarted(parsed); break;
              case 'format.preflight':          handlers.onPreflight?.(parsed); break;
              case 'format.toolchain_installing': handlers.onToolchainInstalling?.(parsed); break;
              case 'format.toolchain_ready':    handlers.onToolchainReady?.(parsed); break;
              case 'format.staging':            handlers.onStaging?.(parsed); break;
              case 'format.manuscript_building': handlers.onManuscriptBuilding?.(parsed); break;
              case 'format.manuscript_ready':   handlers.onManuscriptReady?.(parsed); break;
              case 'format.composite_cover':    handlers.onCompositeCover?.(parsed); break;
              case 'format.cover_ready':        handlers.onCoverReady?.(parsed); break;
              case 'format.cover_failed':       handlers.onCoverFailed?.(parsed); break;
              case 'format.building':           handlers.onBuilding(parsed); break;
              case 'format.ready':              handlers.onReady(parsed); break;
              case 'stage_complete':            handlers.onStageComplete(parsed); break;
              case 'error':                     handlers.onError(parsed.message || 'Formatter error'); break;
              default: break;
            }
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError('Stream disconnected');
    }
  })();

  return controller;
}
