import Anthropic from '@anthropic-ai/sdk';
import { runResearchAgent } from '../src/services/research/research-agent.service';
import type { ComputerSSEWriter } from '../src/services/computer/sse-writer';
import { _debugReset } from '../src/services/computer/e2b-session-store';

function fakeSSE(): ComputerSSEWriter & { events: Array<[string, unknown]> } {
  const events: Array<[string, unknown]> = [];
  return {
    events,
    send: (event, data) => {
      events.push([event as string, data]);
    },
    end: jest.fn(),
  };
}

describe('research agent', () => {
  beforeEach(() => {
    _debugReset();
    (Anthropic as unknown as jest.Mock).mockClear?.();
  });

  it('collects a brief when the model calls emit_research_brief', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AnthropicMock = require('@anthropic-ai/sdk').default as jest.Mock;
    AnthropicMock.mockImplementationOnce(() => ({
      messages: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'br1',
                name: 'browser',
                input: { action: 'search', query: 'AI conferences 2025' },
              },
            ],
          })
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'brief1',
                name: 'emit_research_brief',
                input: {
                  summary: 'Three major AI conferences are scheduled in 2025.',
                  keyFacts: ['KDD in Toronto', 'ICLR in Vienna', 'NeurIPS in Vancouver'],
                  sources: [
                    { url: 'https://kdd.org', title: 'KDD', snippet: 'Toronto', relevance: 0.9 },
                  ],
                },
              },
            ],
          })
          .mockResolvedValueOnce({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'done' }],
          }),
      },
    }));

    const sse = fakeSSE();
    const brief = await runResearchAgent('AI conferences 2025', {
      userId: 'u1',
      sse,
      apiKey: 'test',
      config: { apiKey: 'test' },
    });

    expect(brief.query).toBe('AI conferences 2025');
    expect(brief.summary).toContain('AI conferences');
    expect(brief.keyFacts).toHaveLength(3);
    expect(brief.sources[0].url).toBe('https://kdd.org');
    expect(brief.cappedAt).toBeUndefined();

    const eventNames = sse.events.map(([n]) => n);
    expect(eventNames).toContain('tool_call');
    expect(eventNames).toContain('browser-start');
  });

  it('returns partial brief when action cap is hit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AnthropicMock = require('@anthropic-ai/sdk').default as jest.Mock;
    const create = jest.fn();
    // Fire 3 browser calls in ONE iteration to trip the 12-action cap fast.
    // The in-iteration cap guard returns an is_error tool_result once past 12.
    const multi: Array<{ type: 'tool_use'; id: string; name: string; input: unknown }> = [];
    for (let i = 0; i < 13; i += 1) {
      multi.push({
        type: 'tool_use',
        id: `br${i}`,
        name: 'browser',
        input: { action: 'navigate', url: `https://example.com/${i}` },
      });
    }
    create.mockResolvedValueOnce({ stop_reason: 'tool_use', content: multi });
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'stopping' }],
    });
    AnthropicMock.mockImplementationOnce(() => ({ messages: { create } }));

    const sse = fakeSSE();
    const brief = await runResearchAgent('deep topic', {
      userId: 'u1',
      sse,
      apiKey: 'test',
      config: { apiKey: 'test' },
    });

    expect(brief.cappedAt).toBe('actions');
    expect(brief.summary).toContain('Partial brief');
  }, 90_000);

  it('rejects malformed emit_research_brief input', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AnthropicMock = require('@anthropic-ai/sdk').default as jest.Mock;
    AnthropicMock.mockImplementationOnce(() => ({
      messages: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'b1',
                name: 'emit_research_brief',
                input: { summary: 42 },
              },
            ],
          })
          .mockResolvedValueOnce({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'giving up' }],
          }),
      },
    }));

    const sse = fakeSSE();
    const brief = await runResearchAgent('topic', {
      userId: 'u1',
      sse,
      apiKey: 'test',
      config: { apiKey: 'test' },
    });

    // Malformed brief should be rejected, so no brief collected — summary is the partial fallback.
    expect(brief.summary).toContain('Partial brief');
  });
});
