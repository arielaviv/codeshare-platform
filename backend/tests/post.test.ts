import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import { app } from '../src/server';
import { createTestUser, createTestPost, getAuthHeader } from './setup';

const testImagePath = path.join(__dirname, 'fixtures', 'test-image.png');
const testTextPath = path.join(__dirname, 'fixtures', 'test-file.txt');

describe('GET /api/posts', () => {
  it('should return paginated posts', async () => {
    const { accessToken } = await createTestUser();
    await createTestPost(accessToken, { title: 'Post 1' });
    await createTestPost(accessToken, { title: 'Post 2' });

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
  });

  it('should respect page and limit params', async () => {
    const { accessToken } = await createTestUser();
    for (let i = 0; i < 5; i++) {
      await createTestPost(accessToken, { title: `Post ${i}` });
    }

    const res = await request(app).get('/api/posts?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.hasMore).toBe(true);
  });

  it('should return posts with populated userId (username, profileImage)', async () => {
    const { accessToken } = await createTestUser();
    await createTestPost(accessToken);

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    const post = res.body.posts[0];
    expect(post.userId).toBeDefined();
    expect(post.userId.username).toBeDefined();
    expect(typeof post.userId.username).toBe('string');
  });

  it('should include isLiked status for authenticated user', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    // Like the post
    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(accessToken));

    const res = await request(app)
      .get('/api/posts')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    const likedPost = res.body.posts.find((p: { _id: string }) => p._id === post._id);
    expect(likedPost.isLiked).toBe(true);
  });

  it('should still work with invalid auth token (optionalAuth)', async () => {
    const { accessToken } = await createTestUser();
    await createTestPost(accessToken);

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.status).toBe(200);
    expect(res.body.posts).toBeDefined();
  });

  it('should return pagination metadata (page, total, hasMore)', async () => {
    const { accessToken } = await createTestUser();
    await createTestPost(accessToken);

    const res = await request(app).get('/api/posts?page=1&limit=10');

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.pages).toBe(1);
  });
});

describe('GET /api/posts/:id', () => {
  it('should return single post with user info', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app).get(`/api/posts/${post._id}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test Post');
    expect(res.body.userId).toBeDefined();
    expect(res.body.userId.username).toBeDefined();
  });

  it('should return 404 for non-existent post', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/posts/${fakeId}`);

    expect(res.status).toBe(404);
  });

  it('should include isLiked for authenticated user on single post', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    // Like it
    await request(app)
      .post(`/api/posts/${post._id}/like`)
      .set(getAuthHeader(accessToken));

    const res = await request(app)
      .get(`/api/posts/${post._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.isLiked).toBe(true);
  });
});

describe('POST /api/posts', () => {
  it('should create post with valid data (auth required)', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'New Post',
        code: 'print("hello")',
        language: 'python',
        description: 'A python snippet',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Post created successfully');
    expect(res.body.post.title).toBe('New Post');
    expect(res.body.post.language).toBe('python');
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({
        title: 'No Auth Post',
        code: 'x = 1',
        language: 'python',
      });

    expect(res.status).toBe(401);
  });

  it('should reject missing required fields (title, code, language)', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .send({ title: 'Only Title' });

    expect(res.status).toBe(400);
  });

  it('should reject validation error and clean up uploaded file', async () => {
    const { accessToken } = await createTestUser();

    // Missing required 'code' field but with an image
    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .field('title', 'Missing Code')
      .field('language', 'javascript')
      .attach('image', testImagePath);

    expect(res.status).toBe(400);
  });

  it('should create post with image upload', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .field('title', 'Post With Image')
      .field('code', 'const x = 1;')
      .field('language', 'javascript')
      .attach('image', testImagePath);

    expect(res.status).toBe(201);
    expect(res.body.post.image).toBeDefined();
    expect(res.body.post.image).toContain('/uploads/');
  });

  it('should reject non-image file upload', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .field('title', 'Bad File')
      .field('code', 'x = 1')
      .field('language', 'python')
      .attach('image', testTextPath);

    expect(res.status).toBe(400);
  });

  it('should accept optional description', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'With Description',
        code: 'let x = 1;',
        language: 'javascript',
        description: 'Optional desc',
      });

    expect(res.status).toBe(201);
    expect(res.body.post.description).toBe('Optional desc');
  });
});

describe('PUT /api/posts/:id', () => {
  it('should update own post', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .put(`/api/posts/${post._id}`)
      .set(getAuthHeader(accessToken))
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.post.title).toBe('Updated Title');
  });

  it('should update post with image', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .put(`/api/posts/${post._id}`)
      .set(getAuthHeader(accessToken))
      .field('title', 'Updated With Image')
      .attach('image', testImagePath);

    expect(res.status).toBe(200);
    expect(res.body.post.title).toBe('Updated With Image');
    expect(res.body.post.image).toContain('/uploads/');
  });

  it('should replace existing image on update', async () => {
    const { accessToken } = await createTestUser();

    // Create post with image
    const createRes = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .field('title', 'Has Image')
      .field('code', 'x = 1')
      .field('language', 'python')
      .attach('image', testImagePath);

    const postId = createRes.body.post._id;
    const oldImage = createRes.body.post.image;

    // Update with new image
    const res = await request(app)
      .put(`/api/posts/${postId}`)
      .set(getAuthHeader(accessToken))
      .attach('image', testImagePath);

    expect(res.status).toBe(200);
    expect(res.body.post.image).toContain('/uploads/');
    expect(res.body.post.image).not.toBe(oldImage);
  });

  it('should reject update from different user (403)', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    const res = await request(app)
      .put(`/api/posts/${post._id}`)
      .set(getAuthHeader(user2.accessToken))
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('should reject update with image on non-existent post', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .put(`/api/posts/${fakeId}`)
      .set(getAuthHeader(accessToken))
      .field('title', 'Ghost')
      .attach('image', testImagePath);

    expect(res.status).toBe(404);
  });

  it('should reject update with image from different user and clean up file', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    const res = await request(app)
      .put(`/api/posts/${post._id}`)
      .set(getAuthHeader(user2.accessToken))
      .field('title', 'Hacked')
      .attach('image', testImagePath);

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .put(`/api/posts/${post._id}`)
      .send({ title: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/posts/:id (404)', () => {
  it('should return 404 for non-existent post', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .put(`/api/posts/${fakeId}`)
      .set(getAuthHeader(accessToken))
      .send({ title: 'Ghost Post' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/posts/:id', () => {
  it('should delete own post', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app)
      .delete(`/api/posts/${post._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Post deleted successfully');

    // Verify it's actually deleted
    const getRes = await request(app).get(`/api/posts/${post._id}`);
    expect(getRes.status).toBe(404);
  });

  it('should delete post with image', async () => {
    const { accessToken } = await createTestUser();

    // Create post with image
    const createRes = await request(app)
      .post('/api/posts')
      .set(getAuthHeader(accessToken))
      .field('title', 'To Delete With Image')
      .field('code', 'x = 1')
      .field('language', 'python')
      .attach('image', testImagePath);

    const postId = createRes.body.post._id;

    const res = await request(app)
      .delete(`/api/posts/${postId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
  });

  it('should reject delete from different user (403)', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const post = await createTestPost(user1.accessToken);

    const res = await request(app)
      .delete(`/api/posts/${post._id}`)
      .set(getAuthHeader(user2.accessToken));

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent post', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .delete(`/api/posts/${fakeId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(404);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const post = await createTestPost(accessToken);

    const res = await request(app).delete(`/api/posts/${post._id}`);

    expect(res.status).toBe(401);
  });
});
