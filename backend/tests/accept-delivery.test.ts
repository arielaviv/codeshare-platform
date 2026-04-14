import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { UsageEvent } from '../src/models/UsageEvent';
import { topUp } from '../src/services/wallet.service';

describe('POST /api/ai/accept-delivery', () => {
  it('accepts a valid plan debit and returns ok:true + balance', async () => {
    const { user, accessToken } = await createTestUser();
    await topUp(new mongoose.Types.ObjectId(user.id), 1000);

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: 'abc123', priceCents: 249 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.planId).toBe('abc123');
    expect(res.body.priceCents).toBe(249);
    expect(res.body.newBalanceCents).toBe(751);
  });

  it('writes a UsageEvent with deliveryStatus delivered', async () => {
    const { user, accessToken } = await createTestUser();
    await topUp(new mongoose.Types.ObjectId(user.id), 500);

    await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: 'abc456', priceCents: 99 });

    const events = await UsageEvent.find({ userId: user.id, feature: 'delivery-verify' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].deliveryStatus).toBe('delivered');
    expect(events[0].costCents).toBe(99);
  });

  it('rejects the debit with 402 when wallet balance is insufficient', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: 'broke', priceCents: 249 });

    expect(res.status).toBe(402);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .send({ planId: 'abc123', priceCents: 249 });

    expect(res.status).toBe(401);
  });

  it('rejects missing planId with 400', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ priceCents: 249 });

    expect(res.status).toBe(400);
  });

  it('rejects negative priceCents with 400', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: 'abc123', priceCents: -100 });

    expect(res.status).toBe(400);
  });

  it('rejects priceCents above the $1000 safety cap', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: 'abc123', priceCents: 100001 });

    expect(res.status).toBe(400);
  });

  it('rejects planId longer than 100 characters', async () => {
    const { accessToken } = await createTestUser();
    const longId = 'x'.repeat(101);

    const res = await request(app)
      .post('/api/ai/accept-delivery')
      .set(getAuthHeader(accessToken))
      .send({ planId: longId, priceCents: 100 });

    expect(res.status).toBe(400);
  });
});
