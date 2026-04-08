import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { Post } from '../src/models/Post';
import { Comment } from '../src/models/Comment';
import { createTestUser, createTestPost, getAuthHeader } from './setup';

describe('GET /api/posts/:postId/comments', () => {
  it('should return comments for a post', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    // Add comments
    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'First comment' });

    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Second comment' });

    const res = await request(app).get(`/api/posts/${post._id}/comments`);

    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  it('should return 404 for non-existent post', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/posts/${fakeId}/comments`);

    expect(res.status).toBe(404);
  });

  it('should return empty array when no comments', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app).get(`/api/posts/${post._id}/comments`);

    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(0);
  });

  it('should populate userId with username', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Populated comment' });

    const res = await request(app).get(`/api/posts/${post._id}/comments`);

    expect(res.body.comments[0].userId).toBeDefined();
    expect(res.body.comments[0].userId.username).toBeDefined();
    expect(typeof res.body.comments[0].userId.username).toBe('string');
  });
});

describe('POST /api/posts/:postId/comments', () => {
  it('should add comment (auth required)', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Great code!' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Comment added successfully');
    expect(res.body.comment.content).toBe('Great code!');
  });

  it("should increment post's commentsCount", async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Comment 1' });

    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Comment 2' });

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost!.commentsCount).toBe(2);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .send({ content: 'No auth comment' });

    expect(res.status).toBe(401);
  });

  it('should return 404 when post does not exist', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/posts/${fakeId}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Orphan comment' });

    expect(res.status).toBe(404);
  });

  it('should reject empty content', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: '' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('should delete own comment', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'To be deleted' });

    const commentId = commentRes.body.comment._id;

    const res = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Comment deleted successfully');
  });

  it("should decrement post's commentsCount", async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'Will delete' });

    const commentId = commentRes.body.comment._id;

    // commentsCount should be 1 after adding
    let updatedPost = await Post.findById(post._id);
    expect(updatedPost!.commentsCount).toBe(1);

    await request(app)
      .delete(`/api/comments/${commentId}`)
      .set(getAuthHeader(accessToken));

    updatedPost = await Post.findById(post._id);
    expect(updatedPost!.commentsCount).toBe(0);
  });

  it('should reject delete from different user', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(user1.accessToken))
      .send({ content: 'Not your comment' });

    const commentId = commentRes.body.comment._id;

    const res = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set(getAuthHeader(user2.accessToken));

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(getAuthHeader(accessToken))
      .send({ content: 'No auth delete' });

    const commentId = commentRes.body.comment._id;

    const res = await request(app).delete(`/api/comments/${commentId}`);

    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent comment', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .delete(`/api/comments/${fakeId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(404);
  });
});
