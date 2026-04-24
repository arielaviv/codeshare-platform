import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

describe('GET /api/books/:id', () => {
  it('rejects unauthenticated request', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/books/${id}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed book id', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/books/not-an-id')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent book', async () => {
    const { accessToken } = await createTestUser();
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/books/${id}`)
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/books/:id', () => {
  it('rejects unauthenticated request', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).patch(`/api/books/${id}`).send({ title: 'New' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed book id', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .patch('/api/books/not-an-id')
      .set(getAuthHeader(accessToken))
      .send({ title: 'New' });
    expect(res.status).toBe(400);
  });
});
