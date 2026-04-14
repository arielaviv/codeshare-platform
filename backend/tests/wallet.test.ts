import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { Wallet } from '../src/models/Wallet';
import {
  appendCredit,
  debitForFeature,
  getBalance,
  topUp,
} from '../src/services/wallet.service';

describe('wallet.service', () => {
  describe('getBalance', () => {
    it('returns 0 for a user with no wallet', async () => {
      const userId = new mongoose.Types.ObjectId();
      expect(await getBalance(userId)).toBe(0);
    });

    it('returns the current balance', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 500);
      expect(await getBalance(userId)).toBe(500);
    });
  });

  describe('topUp', () => {
    it('creates wallet on first top-up and records a transaction', async () => {
      const userId = new mongoose.Types.ObjectId();
      const res = await topUp(userId, 1000);
      expect(res.ok).toBe(true);
      expect(res.newBalanceCents).toBe(1000);

      const wallet = await Wallet.findOne({ userId });
      expect(wallet).not.toBeNull();
      expect(wallet!.balanceCents).toBe(1000);
      expect(wallet!.transactions).toHaveLength(1);
      expect(wallet!.transactions[0].kind).toBe('topup');
      expect(wallet!.transactions[0].amountCents).toBe(1000);
    });

    it('accumulates across multiple top-ups', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 100);
      await topUp(userId, 250);
      const res = await topUp(userId, 150);
      expect(res.newBalanceCents).toBe(500);
      const wallet = await Wallet.findOne({ userId });
      expect(wallet!.transactions).toHaveLength(3);
    });

    it('rejects non-positive amounts without mutating balance', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 500);
      const res = await topUp(userId, 0);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('invalid_amount');
      expect(res.newBalanceCents).toBe(500);
    });
  });

  describe('appendCredit', () => {
    it('credits welcome/prize/milestone bonuses with reason recorded', async () => {
      const userId = new mongoose.Types.ObjectId();
      const res = await appendCredit(userId, 300, 'prize-credit', 'jackpot');
      expect(res.ok).toBe(true);
      expect(res.newBalanceCents).toBe(300);

      const wallet = await Wallet.findOne({ userId });
      expect(wallet!.transactions[0].kind).toBe('prize-credit');
      expect(wallet!.transactions[0].reason).toBe('jackpot');
    });
  });

  describe('debitForFeature', () => {
    it('debits atomically when balance is sufficient', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 500);
      const res = await debitForFeature(userId, 150, 'polish-logo');
      expect(res.ok).toBe(true);
      expect(res.newBalanceCents).toBe(350);

      const wallet = await Wallet.findOne({ userId });
      const debitTx = wallet!.transactions.find((t) => t.kind === 'feature-debit');
      expect(debitTx).toBeDefined();
      expect(debitTx!.amountCents).toBe(-150);
      expect(debitTx!.featureId).toBe('polish-logo');
    });

    it('returns ok:false when balance is insufficient and does not mutate', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 100);
      const res = await debitForFeature(userId, 500);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('insufficient_balance');
      expect(res.newBalanceCents).toBe(100);
      const wallet = await Wallet.findOne({ userId });
      expect(wallet!.balanceCents).toBe(100);
      expect(wallet!.transactions).toHaveLength(1); // only the topup
    });

    it('returns ok:false with zero balance when no wallet exists', async () => {
      const userId = new mongoose.Types.ObjectId();
      const res = await debitForFeature(userId, 50);
      expect(res.ok).toBe(false);
      expect(res.newBalanceCents).toBe(0);
    });

    it('rejects non-positive debit amount', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 500);
      const res = await debitForFeature(userId, 0);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('invalid_amount');
      expect(res.newBalanceCents).toBe(500);
    });

    it('never drops the balance below zero under concurrent debits', async () => {
      const userId = new mongoose.Types.ObjectId();
      await topUp(userId, 100);

      // Fire 10 concurrent debits of 30¢ against a 100¢ balance — at most 3 can succeed.
      const results = await Promise.all(
        Array.from({ length: 10 }, () => debitForFeature(userId, 30, 'stress'))
      );

      const successes = results.filter((r) => r.ok).length;
      const failures = results.filter((r) => !r.ok).length;
      expect(successes).toBeLessThanOrEqual(3);
      expect(successes + failures).toBe(10);

      const wallet = await Wallet.findOne({ userId });
      expect(wallet!.balanceCents).toBeGreaterThanOrEqual(0);
      expect(wallet!.balanceCents).toBe(100 - successes * 30);
    });
  });
});

describe('GET /api/wallet', () => {
  it('returns 0 balance for a brand-new user with no wallet', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app).get('/api/wallet').set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(0);
    expect(res.body.transactions).toEqual([]);
  });

  it('returns balance and recent transactions after top-up', async () => {
    const { user, accessToken } = await createTestUser();
    await topUp(new mongoose.Types.ObjectId(user.id), 750);

    const res = await request(app).get('/api/wallet').set(getAuthHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(750);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].kind).toBe('topup');
    expect(res.body.transactions[0].amountCents).toBe(750);
    expect(typeof res.body.transactions[0].id).toBe('string');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/wallet');
    expect(res.status).toBe(401);
  });

  it('isolates balances per user', async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    await topUp(new mongoose.Types.ObjectId(u1.user.id), 400);

    const r1 = await request(app).get('/api/wallet').set(getAuthHeader(u1.accessToken));
    const r2 = await request(app).get('/api/wallet').set(getAuthHeader(u2.accessToken));
    expect(r1.body.balanceCents).toBe(400);
    expect(r2.body.balanceCents).toBe(0);
  });
});

describe('POST /api/wallet/topup', () => {
  it('credits the wallet with the requested amount', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: 500 });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(500);

    const again = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: 100 });
    expect(again.body.balanceCents).toBe(600);
  });

  it('rejects missing amountCents', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects non-integer amount', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: 1.5 });
    expect(res.status).toBe(400);
  });

  it('rejects negative amount', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: -100 });
    expect(res.status).toBe(400);
  });

  it('rejects zero amount', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects top-ups above the $100 cap', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/wallet/topup')
      .set(getAuthHeader(accessToken))
      .send({ amountCents: 20000 });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/wallet/topup')
      .send({ amountCents: 500 });
    expect(res.status).toBe(401);
  });
});
