import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { SlideDeck } from '../src/models/SlideDeck';
import { UsageEvent } from '../src/models/UsageEvent';

const MockAnthropic = Anthropic as unknown as jest.Mock;

const SAMPLE_DECK_INPUT = {
  title: 'AI in Healthcare',
  description: 'How AI is transforming clinical workflows',
  theme: {
    palette: 'gartner-blue',
    accentColor: '#002060',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  slides: [
    { id: 's1', type: 'title', content: { heading: 'AI in Healthcare', subtitle: '2026 landscape' } },
    { id: 's2', type: 'bullets', content: { heading: 'Benefits', items: ['Faster diagnosis', 'Fewer errors', 'Better outcomes'] } },
    { id: 's3', type: 'stat', content: { value: '30%', label: 'diagnostic error reduction', trend: 'down' } },
    { id: 's4', type: 'chart-bar', content: { heading: 'Adoption by sector', data: [{ label: 'Imaging', value: 65 }, { label: 'Clinical notes', value: 45 }, { label: 'Triage', value: 30 }] } },
    { id: 's5', type: 'bullets', content: { heading: 'Takeaways', items: ['Start small', 'Measure outcomes', 'Iterate'] } },
  ],
};

function mockSuccessfulGeneration(overrides: Partial<typeof SAMPLE_DECK_INPUT> = {}): void {
  MockAnthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_01',
            name: 'create_deck',
            input: { ...SAMPLE_DECK_INPUT, ...overrides },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 120, output_tokens: 800 },
      }),
    },
  }));
}

async function collectSSE(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; events: Array<{ event: string; data: unknown }> }> {
  const res = await request(app)
    .post('/api/ai/generate-deck')
    .set(getAuthHeader(token))
    .send(body);

  if (res.status !== 200) {
    return { status: res.status, events: [] };
  }

  const raw = res.text || '';
  const parts = raw.split('\n\n').filter(Boolean);
  const events = parts
    .map((part) => {
      const lines = part.split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!event) return null;
      try {
        return { event, data: JSON.parse(data) };
      } catch {
        return { event, data };
      }
    })
    .filter((e): e is { event: string; data: unknown } => e !== null);

  return { status: res.status, events };
}

describe('POST /api/ai/generate-deck', () => {
  beforeEach(() => {
    MockAnthropic.mockReset();
  });

  it('should generate a deck via SSE and persist it', async () => {
    mockSuccessfulGeneration();
    const { accessToken } = await createTestUser();

    const { status, events } = await collectSSE(accessToken, {
      topic: 'AI in Healthcare',
      slideCount: 5,
      style: 'professional',
    });

    expect(status).toBe(200);

    const eventTypes = events.map((e) => e.event);
    expect(eventTypes[0]).toBe('deck_started');
    expect(eventTypes).toContain('slide_received');
    expect(eventTypes[eventTypes.length - 1]).toBe('deck_complete');

    const slideEvents = events.filter((e) => e.event === 'slide_received');
    expect(slideEvents).toHaveLength(5);

    const complete = events[events.length - 1].data as { deckId: string; slideCount: number };
    expect(complete.deckId).toBeDefined();
    expect(complete.slideCount).toBe(5);

    const persisted = await SlideDeck.findById(complete.deckId);
    expect(persisted).not.toBeNull();
    expect(persisted!.title).toBe('AI in Healthcare');
    expect(persisted!.slides).toHaveLength(5);
    expect(persisted!.slides[0].type).toBe('title');
  });

  it('should log a UsageEvent for deck-generation', async () => {
    mockSuccessfulGeneration();
    const { accessToken, user } = await createTestUser();

    await collectSSE(accessToken, { topic: 'Widgets', slideCount: 5 });

    const events = await UsageEvent.find({ userId: user.id, feature: 'deck-generation' });
    expect(events.length).toBe(1);
    expect(events[0].modelName).toBe('claude-sonnet-4-6');
    expect(events[0].inputTokens).toBe(120);
    expect(events[0].outputTokens).toBe(800);
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/ai/generate-deck')
      .send({ topic: 'X', slideCount: 5 });

    expect(res.status).toBe(401);
  });

  it('should reject invalid slideCount (too low)', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/generate-deck')
      .set(getAuthHeader(accessToken))
      .send({ topic: 'valid topic', slideCount: 2 });

    expect(res.status).toBe(400);
  });

  it('should reject invalid slideCount (too high)', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/generate-deck')
      .set(getAuthHeader(accessToken))
      .send({ topic: 'valid topic', slideCount: 25 });

    expect(res.status).toBe(400);
  });

  it('should reject missing topic', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/generate-deck')
      .set(getAuthHeader(accessToken))
      .send({ slideCount: 5 });

    expect(res.status).toBe(400);
  });

  it('should emit error event when model does not return a tool_use', async () => {
    MockAnthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I refuse' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    }));
    const { accessToken } = await createTestUser();

    const { status, events } = await collectSSE(accessToken, {
      topic: 'some topic',
      slideCount: 5,
    });

    expect(status).toBe(200);
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
  });

  it('should emit error event when generated deck has no slides', async () => {
    mockSuccessfulGeneration({ slides: [] });
    const { accessToken } = await createTestUser();

    const { events } = await collectSSE(accessToken, {
      topic: 'empty deck',
      slideCount: 5,
    });

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as { message: string }).message).toMatch(/no slides/i);
  });

  it('should associate generated deck with the requesting user', async () => {
    mockSuccessfulGeneration();
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    await collectSSE(user1.accessToken, { topic: 'topic one', slideCount: 5 });
    await collectSSE(user2.accessToken, { topic: 'topic two', slideCount: 5 });

    const user1Decks = await SlideDeck.find({ userId: user1.user.id });
    const user2Decks = await SlideDeck.find({ userId: user2.user.id });
    expect(user1Decks).toHaveLength(1);
    expect(user2Decks).toHaveLength(1);
  });
});
