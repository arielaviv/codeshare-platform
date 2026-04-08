import request from 'supertest';
import { app } from '../src/server';
import { User } from '../src/models/User';
import { createTestUser } from './setup';

describe('POST /api/auth/register', () => {
  it('should register new user with valid data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered successfully');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe('newuser');
    expect(res.body.user.email).toBe('new@example.com');
  });

  it('should return accessToken, refreshToken, and user object', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'tokenuser',
        email: 'token@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.refreshToken).toBeDefined();
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.id).toBeDefined();
  });

  it('should reject duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'first',
        email: 'dupe@example.com',
        password: 'password123',
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'second',
        email: 'dupe@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Email already registered');
  });

  it('should reject duplicate username', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'dupeuser',
        email: 'first@example.com',
        password: 'password123',
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'dupeuser',
        email: 'second@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Username already taken');
  });

  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'bademail',
        email: 'not-an-email',
        password: 'password123',
      });

    expect(res.status).toBe(400);
  });

  it('should reject short password (< 6 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'shortpw',
        email: 'shortpw@example.com',
        password: '123',
      });

    expect(res.status).toBe(400);
  });

  it('should reject short username (< 3 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'ab',
        email: 'short@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(400);
  });

  it('should hash the password (not store plaintext)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'hashcheck',
        email: 'hash@example.com',
        password: 'password123',
      });

    const user = await User.findOne({ email: 'hash@example.com' }).select('+password');
    expect(user).toBeDefined();
    expect(user!.password).not.toBe('password123');
    expect(user!.password!.startsWith('$2')).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'loginuser',
        email: 'login@example.com',
        password: 'password123',
      });
  });

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login successful');
  });

  it('should return tokens and user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'password123',
      });

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe('loginuser');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'wrongpassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid email or password');
  });

  it('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nobody@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(401);
  });

  it('should reject missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should return new tokens with valid refresh token', async () => {
    const { refreshToken } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.message).toBe('Token refreshed successfully');
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token-string' });

    expect(res.status).toBe(401);
  });

  it('should reject missing refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('should successfully logout', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logout successful');
  });

  it('should invalidate the refresh token', async () => {
    const { accessToken, refreshToken, user } = await createTestUser();

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    const dbUser = await User.findById(user.id).select('+refreshToken');
    expect(dbUser!.refreshToken).toBeNull();

    // Old refresh token should no longer work
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });
});

describe('Auth middleware edge cases', () => {
  it('should reject request with Bearer but no token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  it('should reject request with invalid token format', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'InvalidFormat');

    expect(res.status).toBe(401);
  });

  it('should reject request with expired/malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user when authenticated', async () => {
    const { accessToken, user } = await createTestUser();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.username).toBe(user.username);
  });

  it('should reject unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});
