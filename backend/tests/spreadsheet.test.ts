import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('GET /api/spreadsheets', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/spreadsheets');
    expect(res.status).toBe(401);
  });

  it('returns empty list for a new user', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/spreadsheets')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.spreadsheets)).toBe(true);
    expect(res.body.spreadsheets).toHaveLength(0);
  });
});

describe('GET /api/spreadsheets/:id', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/spreadsheets/64a000000000000000000000');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent spreadsheet', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/spreadsheets/64a000000000000000000000')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/spreadsheets/:id', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .patch('/api/spreadsheets/64a000000000000000000000')
      .send({ title: 'Renamed' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent spreadsheet', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .patch('/api/spreadsheets/64a000000000000000000000')
      .set(getAuthHeader(accessToken))
      .send({ title: 'Renamed' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/spreadsheets/:id', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).delete('/api/spreadsheets/64a000000000000000000000');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent spreadsheet', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .delete('/api/spreadsheets/64a000000000000000000000')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(404);
  });
});
