import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { UsageEvent } from '../src/models/UsageEvent';

const MockAnthropic = Anthropic as unknown as jest.Mock;

function mockIntent(intent: string, confidence = 0.9): void {
  MockAnthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_01',
            name: 'record_intent',
            input: { intent, confidence },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 20, output_tokens: 10 },
      }),
    },
  }));
}

describe('POST /api/ai/classify-intent', () => {
  it('should classify a slide deck request as "deck"', async () => {
    mockIntent('deck', 0.95);
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'Make me a pitch deck about climate tech' });

    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('deck');
    expect(res.body.confidence).toBe(0.95);
  });

  it('should classify a build request as "code-app"', async () => {
    mockIntent('code-app', 0.88);
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'Build me a todo list app with react' });

    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('code-app');
  });

  it('should classify a code explanation request as "code-explain"', async () => {
    mockIntent('code-explain', 0.92);
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'Explain what this useEffect hook does' });

    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('code-explain');
  });

  it('should clamp confidence to [0, 1]', async () => {
    mockIntent('deck', 1.7);
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'pitch deck' });

    expect(res.status).toBe(200);
    expect(res.body.confidence).toBe(1);
  });

  it('should fall back to code-app when no tool_use returned', async () => {
    MockAnthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'unsure' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    }));
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'do something' });

    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('code-app');
    expect(res.body.confidence).toBeLessThan(0.5);
  });

  it('should log a UsageEvent for intent-classify', async () => {
    mockIntent('deck');
    const { accessToken, user } = await createTestUser();

    await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: 'pitch deck about healthcare' });

    const events = await UsageEvent.find({ userId: user.id, feature: 'intent-classify' });
    expect(events.length).toBe(1);
    expect(events[0].modelName).toBe('claude-haiku-4-5-20251001');
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/ai/classify-intent')
      .send({ prompt: 'pitch deck' });

    expect(res.status).toBe(401);
  });

  it('should reject empty prompt', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/classify-intent')
      .set(getAuthHeader(accessToken))
      .send({ prompt: '' });

    expect(res.status).toBe(400);
  });
});
