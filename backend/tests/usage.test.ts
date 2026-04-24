import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('GET /api/usage', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/usage');
    expect(res.status).toBe(401);
  });

  it('returns balance and records for a new user', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/usage')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(0);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.records).toHaveLength(0);
  });
});
