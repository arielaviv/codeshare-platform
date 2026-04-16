import { API_URL } from './api';
import type { GenerateDeckRequest, ResearchBrief, Slide } from '../types/deck';
import type { PrizeAward } from '../types';

export interface DeckStreamHandlers {
  onStarted(data: { topic: string; slideCount: number }): void;
  onSlideReceived(slide: Slide): void;
  onComplete(data: { deckId: string; title: string; slideCount: number }): void;
  onPrizeAwarded?(prize: PrizeAward): void;
  onError(message: string): void;
  // Part 3: optional research-phase handlers. Backend prefixes research
  // subagent events with `research_` so this stream stays backward
  // compatible; clients that don't care can omit these.
  onPhase?(phase: 'researching' | 'drafting'): void;
  onResearchBrowserStart?(data: { executionId?: string; streamUrl?: string }): void;
  onResearchBrowserAction?(data: { executionId?: string; action?: string; target?: string; url?: string; title?: string }): void;
  onResearchBrowserEnd?(data: { executionId?: string }): void;
  onResearchBriefReady?(data: ResearchBrief): void;
  onResearchFailed?(data: { message: string }): void;
}

export function streamDeckGeneration(
  req: GenerateDeckRequest,
  handlers: DeckStreamHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem('accessToken');

    let response: Response;
    try {
      response = await fetch(`${API_URL}/ai/generate-deck`, {
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
      handlers.onError('Failed to connect to deck generator');
      return;
    }

    if (response.status === 401) {
      handlers.onError('Session expired. Please log in again.');
      window.location.href = '/login';
      return;
    }

    if (response.status === 429) {
      handlers.onError('Rate limit reached. Try again later.');
      return;
    }

    if (response.status === 400) {
      try {
        const body = await response.json();
        handlers.onError(body.message || 'Invalid request');
      } catch {
        handlers.onError('Invalid request');
      }
      return;
    }

    if (!response.ok || !response.body) {
      handlers.onError('Deck generation failed');
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
              case 'deck_started':
                handlers.onStarted(parsed);
                break;
              case 'slide_received':
                if (parsed.slide) handlers.onSlideReceived(parsed.slide);
                break;
              case 'deck_complete':
                handlers.onComplete(parsed);
                break;
              case 'prize_awarded':
                handlers.onPrizeAwarded?.({
                  amountCents: parsed.amountCents,
                  newBalanceCents: parsed.newBalanceCents,
                  reason: parsed.reason || '',
                });
                break;
              case 'deck_phase':
                handlers.onPhase?.(parsed.phase);
                break;
              case 'research_browser-start':
                handlers.onResearchBrowserStart?.(parsed);
                break;
              case 'research_browser-action':
                handlers.onResearchBrowserAction?.(parsed);
                break;
              case 'research_browser-end':
                handlers.onResearchBrowserEnd?.(parsed);
                break;
              case 'research_brief_ready':
                handlers.onResearchBriefReady?.(parsed);
                break;
              case 'research_failed':
                handlers.onResearchFailed?.(parsed);
                break;
              case 'error':
                handlers.onError(parsed.message || 'Unknown error');
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
      }
    }
  })();

  return controller;
}
