import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('POST /api/app-chat/widgets', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/app-chat/widgets')
      .send({ projectName: 'demo' });
    expect(res.status).toBe(401);
  });

  it('rejects missing projectName', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/app-chat/widgets')
      .set(getAuthHeader(accessToken))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects empty projectName', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/app-chat/widgets')
      .set(getAuthHeader(accessToken))
      .send({ projectName: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/app-chat/:widgetId', () => {
  it('rejects request without widget jwt', async () => {
    const res = await request(app)
      .post('/api/app-chat/some-widget-id')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid widget jwt', async () => {
    const res = await request(app)
      .post('/api/app-chat/some-widget-id')
      .send({
        jwt: 'not-a-real-jwt',
        messages: [{ role: 'user', content: 'hi' }],
      });
    expect(res.status).toBe(401);
  });
});
