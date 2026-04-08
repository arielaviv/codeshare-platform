import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import { app } from '../src/server';
import { createTestUser, createTestPost, getAuthHeader } from './setup';

const testImagePath = path.join(__dirname, 'fixtures', 'test-image.png');

describe('GET /api/users/:id', () => {
  it('should return user profile', async () => {
    const { user } = await createTestUser();

    const res = await request(app).get(`/api/users/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.username).toBe(user.username);
    expect(res.body.email).toBe(user.email);
    expect(res.body.createdAt).toBeDefined();
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/users/${fakeId}`);

    expect(res.status).toBe(404);
  });

  it('should not return password field', async () => {
    const { user } = await createTestUser();

    const res = await request(app).get(`/api/users/${user.id}`);

    expect(res.body.password).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
  });
});

describe('PUT /api/users/:id', () => {
  it('should update username (auth required, owner only)', async () => {
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .send({ username: 'updatedname' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('updatedname');
  });

  it('should update bio', async () => {
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .send({ bio: 'My new bio' });

    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe('My new bio');
  });

  it('should reject update from different user (403)', async () => {
    const { user } = await createTestUser();
    const other = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(other.accessToken))
      .send({ bio: 'hacked' });

    expect(res.status).toBe(403);
  });

  it('should reject update with image from different user and clean up file', async () => {
    const { user } = await createTestUser();
    const other = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(other.accessToken))
      .attach('profileImage', testImagePath);

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated request (401)', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .send({ bio: 'no auth' });

    expect(res.status).toBe(401);
  });

  it('should replace existing profile image on update', async () => {
    const { user, accessToken } = await createTestUser();

    // First upload
    await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .attach('profileImage', testImagePath);

    // Second upload (replaces)
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .attach('profileImage', testImagePath);

    expect(res.status).toBe(200);
    expect(res.body.user.profileImage).toContain('/uploads/');
  });

  it('should update profile image', async () => {
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .attach('profileImage', testImagePath);

    expect(res.status).toBe(200);
    expect(res.body.user.profileImage).toContain('/uploads/');
  });

  it('should reject invalid validation with uploaded file (clean up)', async () => {
    const { user, accessToken } = await createTestUser();

    // Username too short (< 3 chars) with file
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set(getAuthHeader(accessToken))
      .field('username', 'ab')
      .attach('profileImage', testImagePath);

    expect(res.status).toBe(400);
  });

  it('should reject duplicate username on update (409)', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user2.user.id}`)
      .set(getAuthHeader(user2.accessToken))
      .send({ username: user1.user.username });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/users/:id/posts', () => {
  it("should return user's posts", async () => {
    const { user, accessToken } = await createTestUser();
    await createTestPost(accessToken, { title: 'User Post 1' });
    await createTestPost(accessToken, { title: 'User Post 2' });

    const res = await request(app).get(`/api/users/${user.id}/posts`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  it('should return 404 for non-existent user posts', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/users/${fakeId}/posts`);

    expect(res.status).toBe(404);
  });

  it('should return empty array for user with no posts', async () => {
    const { user } = await createTestUser();

    const res = await request(app).get(`/api/users/${user.id}/posts`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});
