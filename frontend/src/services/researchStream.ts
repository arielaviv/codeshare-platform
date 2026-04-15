import type { ResearchBrief } from '../types/deck';
import { getApiBase } from '../lib/apiBase';

const API_URL = getApiBase();

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

export interface ResearchStreamOptions {
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export async function requestResearch(
  query: string,
  options: ResearchStreamOptions = {}
): Promise<ResearchBrief | null> {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${API_URL}/ai/research`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let brief: ResearchBrief | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseSSEChunk(buffer);
    buffer = remainder;

    for (const evt of events) {
      if (evt.event === 'research_brief' && typeof evt.data === 'object' && evt.data !== null) {
        brief = evt.data as ResearchBrief;
      } else if (evt.event === 'text_delta' && typeof evt.data === 'object' && evt.data !== null) {
        const d = evt.data as { text?: string };
        if (d.text) options.onProgress?.(d.text);
      } else if (evt.event === 'tool_call' && typeof evt.data === 'object' && evt.data !== null) {
        const d = evt.data as { name?: string; input?: unknown };
        if (d.name === 'browser' && typeof d.input === 'object' && d.input !== null) {
          const inp = d.input as { action?: string; query?: string; url?: string };
          const target = inp.query ?? inp.url ?? inp.action ?? '';
          options.onProgress?.(`browser ${inp.action ?? ''} ${target}`.trim());
        }
      }
    }
  }

  return brief;
}
