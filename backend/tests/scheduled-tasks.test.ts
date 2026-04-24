import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('GET /api/scheduled-tasks', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/scheduled-tasks');
    expect(res.status).toBe(401);
  });

  it('returns empty list for a new user', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/scheduled-tasks')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks).toHaveLength(0);
  });
});

describe('POST /api/scheduled-tasks', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/scheduled-tasks')
      .send({ title: 'Daily', prompt: 'do thing', mode: 'auto', cronExpression: '0 9 * * *' });
    expect(res.status).toBe(401);
  });

  it('rejects missing required fields', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/scheduled-tasks')
      .set(getAuthHeader(accessToken))
      .send({ title: 'Daily' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid cron expression', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/scheduled-tasks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'Daily',
        prompt: 'do thing',
        mode: 'auto',
        cronExpression: 'not-a-cron',
      });
    expect(res.status).toBe(400);
  });

  it('creates a scheduled task with valid input', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/scheduled-tasks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'Daily morning',
        prompt: 'Summarize yesterday',
        mode: 'auto',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});
