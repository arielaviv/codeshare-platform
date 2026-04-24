import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('GET /api/voices', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/voices');
    expect(res.status).toBe(401);
  });

  it('returns a list of voices for an authenticated user', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/voices')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    // The route returns either the live ElevenLabs list or a fallback —
    // either way the shape includes a non-empty array of voices.
    const voices = res.body.voices ?? res.body;
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);
  });
});
