import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('POST /api/sessions', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ firstUserMessage: 'hello' });
    expect(res.status).toBe(401);
  });

  it('rejects empty firstUserMessage', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/sessions')
      .set(getAuthHeader(accessToken))
      .send({ firstUserMessage: '' });
    expect(res.status).toBe(400);
  });

  it('creates a session with a valid first message', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/sessions')
      .set(getAuthHeader(accessToken))
      .send({ firstUserMessage: 'Build a Porsche showcase site' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBeDefined();
  });
});

describe('GET /api/sessions', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('returns an empty list for a new user', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/sessions')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(0);
  });

  it('returns sessions after creating one', async () => {
    const { accessToken } = await createTestUser();
    await request(app)
      .post('/api/sessions')
      .set(getAuthHeader(accessToken))
      .send({ firstUserMessage: 'hi' });
    const res = await request(app)
      .get('/api/sessions')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/sessions/:id', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/sessions/64a000000000000000000000');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent session', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/sessions/64a000000000000000000000')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(404);
  });
});
