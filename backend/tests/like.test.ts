import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { Post } from '../src/models/Post';
import { createTestUser, createTestPost, getAuthHeader } from './setup';

describe('POST /api/posts/:postId/like', () => {
  it('should toggle like on (auth required)', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.isLiked).toBe(true);
    expect(res.body.likesCount).toBe(1);
    expect(res.body.message).toBe('Post liked');
  });

  it('should toggle like off on second call', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    // Like
    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(accessToken));

    // Unlike
    const res = await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.isLiked).toBe(false);
    expect(res.body.likesCount).toBe(0);
    expect(res.body.message).toBe('Post unliked');
  });

  it('should update likesCount', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    // Two users like
    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(user1.accessToken));

    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(user2.accessToken));

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost!.likesCount).toBe(2);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app).post(`/api/posts/${post._id}/like`);

    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent post', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/posts/${fakeId}/like`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(404);
  });
});

describe('GET /api/posts/:postId/likes', () => {
  it('should return likes for a post', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    // Both users like
    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(user1.accessToken));

    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(user2.accessToken));

    const res = await request(app).get(`/api/posts/${post._id}/likes`);

    expect(res.status).toBe(200);
    expect(res.body.likes).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  it('should return 404 for non-existent post', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app).get(`/api/posts/${fakeId}/likes`);

    expect(res.status).toBe(404);
  });

  it('should return empty likes for post with no likes', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app).get(`/api/posts/${post._id}/likes`);

    expect(res.status).toBe(200);
    expect(res.body.likes).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});
