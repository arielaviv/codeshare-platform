import request from 'supertest';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { User } from '../src/models/User';

describe('POST /api/welcome-spin/claim', () => {
  it('should award $10 on first claim and flag user', async () => {
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/welcome-spin/claim')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.awardedCents).toBe(500);
    expect(res.body.newBalanceCents).toBe(500);
    expect(res.body.spins).toHaveLength(2);
    expect(res.body.spins[0].isWin).toBe(false);
    expect(res.body.spins[0].symbols).toEqual(['gold', 'gold', 'feather']);
    expect(res.body.spins[1].isWin).toBe(true);
    expect(res.body.spins[1].symbols).toEqual(['gold', 'gold', 'gold']);

    const persisted = await User.findById(user.id);
    expect(persisted!.hasClaimedWelcomeBonus).toBe(true);
    expect(persisted!.creditsCents).toBe(500);
  });

  it('should return 409 on second claim attempt', async () => {
    const { accessToken } = await createTestUser();

    const first = await request(app)
      .post('/api/welcome-spin/claim')
      .set(getAuthHeader(accessToken));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/welcome-spin/claim')
      .set(getAuthHeader(accessToken));
    expect(second.status).toBe(409);
  });

  it('should not change balance on second claim attempt', async () => {
    const { user, accessToken } = await createTestUser();

    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(accessToken));
    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(accessToken));

    const persisted = await User.findById(user.id);
    expect(persisted!.creditsCents).toBe(500);
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app).post('/api/welcome-spin/claim');
    expect(res.status).toBe(401);
  });

  it('should credit each user independently', async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();

    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(u1.accessToken));
    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(u2.accessToken));

    const p1 = await User.findById(u1.user.id);
    const p2 = await User.findById(u2.user.id);
    expect(p1!.creditsCents).toBe(500);
    expect(p2!.creditsCents).toBe(500);
    expect(p1!.hasClaimedWelcomeBonus).toBe(true);
    expect(p2!.hasClaimedWelcomeBonus).toBe(true);
  });
});

describe('GET /api/welcome-spin/status', () => {
  it('should return unclaimed for new user', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .get('/api/welcome-spin/status')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(false);
    expect(res.body.balanceCents).toBe(0);
  });

  it('should return claimed true + balance after claim', async () => {
    const { accessToken } = await createTestUser();

    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(accessToken));

    const res = await request(app)
      .get('/api/welcome-spin/status')
      .set(getAuthHeader(accessToken));

    expect(res.body.claimed).toBe(true);
    expect(res.body.balanceCents).toBe(500);
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app).get('/api/welcome-spin/status');
    expect(res.status).toBe(401);
  });
});

describe('Auth responses expose credit fields', () => {
  it('register response includes creditsCents=0 and hasClaimedWelcomeBonus=false', async () => {
    const { user } = await createTestUser();
    expect(user).toHaveProperty('creditsCents', 0);
    expect(user).toHaveProperty('hasClaimedWelcomeBonus', false);
  });

  it('GET /api/auth/me returns updated fields after claim', async () => {
    const { accessToken } = await createTestUser();
    await request(app).post('/api/welcome-spin/claim').set(getAuthHeader(accessToken));

    const res = await request(app)
      .get('/api/auth/me')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user.creditsCents).toBe(500);
    expect(res.body.user.hasClaimedWelcomeBonus).toBe(true);
  });
});
