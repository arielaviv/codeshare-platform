import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('POST /api/compute/session', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/compute/session');
    expect(res.status).toBe(401);
  });

  it('returns 503 when E2B is not configured for the test env', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/compute/session')
      .set(getAuthHeader(accessToken));
    expect([200, 503]).toContain(res.status);
  });
});

describe('POST /api/compute/keepalive', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/compute/keepalive');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/compute/session', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).delete('/api/compute/session');
    expect(res.status).toBe(401);
  });
});
