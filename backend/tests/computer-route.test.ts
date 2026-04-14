import request from 'supertest';
import { app } from '../src/server';
import { createTestUser } from './setup';

jest.mock('../src/services/computer-agent.service', () => ({
  runComputerAgent: jest.fn().mockImplementation(async ({ sse }: { sse: { send: Function; end: Function } }) => {
    sse.send('text_delta', { text: 'hi' });
    sse.send('done', { iterations: 1, durationMs: 10 });
    sse.end();
  }),
}));

describe('POST /api/ai/computer', () => {
  it('rejects without auth', async () => {
    const res = await request(app)
      .post('/api/ai/computer')
      .send({ messages: [{ role: 'user', content: 'hello' }] });
    expect(res.status).toBe(401);
  });

  it('rejects without messages', async () => {
    const { accessToken } = await createTestUser();
    process.env.E2B_API_KEY = 'test-key';
    const res = await request(app)
      .post('/api/ai/computer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('streams SSE events with valid input', async () => {
    const { accessToken } = await createTestUser();
    process.env.E2B_API_KEY = 'test-key';
    const res = await request(app)
      .post('/api/ai/computer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ messages: [{ role: 'user', content: 'hello' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: text_delta');
    expect(res.text).toContain('event: done');
  });

  it('errors when E2B_API_KEY is not configured', async () => {
    const { accessToken } = await createTestUser();
    const prior = process.env.E2B_API_KEY;
    delete process.env.E2B_API_KEY;
    const res = await request(app)
      .post('/api/ai/computer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(500);
    if (prior) process.env.E2B_API_KEY = prior;
  });

  it('respects the 5-per-hour rate limit', async () => {
    const { accessToken } = await createTestUser();
    process.env.E2B_API_KEY = 'test-key';

    const payload = { messages: [{ role: 'user', content: 'go' }] };
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/ai/computer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload);
    }
    const res = await request(app)
      .post('/api/ai/computer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
    expect(res.status).toBe(429);
  });
});
