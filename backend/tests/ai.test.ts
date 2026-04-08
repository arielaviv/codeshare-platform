import request from 'supertest';
import { app } from '../src/server';
import { Post } from '../src/models/Post';
import mongoose from 'mongoose';
import { createTestUser, createTestPost, getAuthHeader } from './setup';

describe('POST /api/ai/explain/:postId', () => {
  it('should return AI explanation (mock Anthropic)', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/ai/explain/${post._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeDefined();
    expect(typeof res.body.explanation).toBe('string');
    expect(res.body.cached).toBe(false);
  });

  it('should return cached explanation on second call', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    // First call — generates explanation
    await request(app)
      .post(`/api/ai/explain/${post._id}`)
      .set(getAuthHeader(accessToken));

    // Verify it was saved to the post
    const updatedPost = await Post.findById(post._id);
    expect(updatedPost!.aiExplanation).toBeDefined();

    // Second call — should return cached
    const res = await request(app)
      .post(`/api/ai/explain/${post._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/ai/explain/${post._id}`);

    expect(res.status).toBe(401);
  });

  it('should return 400 for non-existent post', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/ai/explain/${fakeId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Post not found');
  });
});

describe('POST /api/ai/chat', () => {
  it('should return AI chat response (mock Anthropic)', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/chat')
      .set(getAuthHeader(accessToken))
      .send({
        messages: [{ role: 'user', content: 'Hello, explain JavaScript to me' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(typeof res.body.message).toBe('string');
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
      });

    expect(res.status).toBe(401);
  });

  it('should reject empty messages array', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/chat')
      .set(getAuthHeader(accessToken))
      .send({ messages: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Messages array is required');
  });

  it('should reject missing messages field', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/chat')
      .set(getAuthHeader(accessToken))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/agent', () => {
  it('should return SSE stream for authenticated user', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/agent')
      .set(getAuthHeader(accessToken))
      .send({
        messages: [{ role: 'user', content: 'Build a hello world page' }],
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('should reject unauthenticated agent request', async () => {
    const res = await request(app)
      .post('/api/ai/agent')
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
      });

    expect(res.status).toBe(401);
  });

  it('should reject empty messages for agent', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/agent')
      .set(getAuthHeader(accessToken))
      .send({ messages: [] });

    expect(res.status).toBe(400);
  });

  it('should accept workspace parameter', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/agent')
      .set(getAuthHeader(accessToken))
      .send({
        messages: [{ role: 'user', content: 'List files' }],
        workspace: { 'index.html': '<html></html>' },
      });

    expect(res.status).toBe(200);
  });

  it('should accept model parameter', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/agent')
      .set(getAuthHeader(accessToken))
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-haiku-4-5-20251001',
      });

    expect(res.status).toBe(200);
  });
});
