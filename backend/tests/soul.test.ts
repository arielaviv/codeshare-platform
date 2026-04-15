import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { SoulProfile } from '../src/models/SoulProfile';
import {
  readProfile,
  appendWtpSignal,
  updateMomentum,
  detectArchetype,
  buildSystemPromptSnippet,
  onTurnComplete,
} from '../src/services/soul.service';
import type { WtpSignal } from '../src/types/soul';

describe('soul.service', () => {
  describe('readProfile', () => {
    it('creates a default profile for a first-time user', async () => {
      const userId = new mongoose.Types.ObjectId();

      const profile = await readProfile(userId);

      expect(profile.userId).toBe(userId.toString());
      expect(profile.archetype).toBe('unknown');
      expect(profile.interactionMode).toBe('mixed');
      expect(profile.wtpSignals).toEqual([]);
      expect(profile.momentum.score).toBe(0);
      expect(profile.conversionTriggers).toEqual([]);
      expect(profile.aversions).toEqual([]);

      const count = await SoulProfile.countDocuments({ userId });
      expect(count).toBe(1);
    });

    it('returns the same profile on subsequent reads (no duplicate)', async () => {
      const userId = new mongoose.Types.ObjectId();
      await readProfile(userId);
      await readProfile(userId);

      const count = await SoulProfile.countDocuments({ userId });
      expect(count).toBe(1);
    });

    it('accepts a string userId', async () => {
      const userId = new mongoose.Types.ObjectId();
      const profile = await readProfile(userId.toString());
      expect(profile.userId).toBe(userId.toString());
    });
  });

  describe('appendWtpSignal', () => {
    it('creates profile and appends signal for a new user', async () => {
      const userId = new mongoose.Types.ObjectId();

      await appendWtpSignal(userId, {
        kind: 'plan-accepted',
        featureTier: 'brains',
        priceCents: 79,
      });

      const profile = await readProfile(userId);
      expect(profile.wtpSignals).toHaveLength(1);
      expect(profile.wtpSignals[0].kind).toBe('plan-accepted');
      expect(profile.wtpSignals[0].featureTier).toBe('brains');
      expect(profile.wtpSignals[0].priceCents).toBe(79);
      expect(profile.wtpSignals[0].createdAt).toBeInstanceOf(Date);
    });

    it('caps signals at 200 most recent', async () => {
      const userId = new mongoose.Types.ObjectId();

      for (let i = 0; i < 210; i++) {
        await appendWtpSignal(userId, {
          kind: 'plan-accepted',
          context: `signal-${i}`,
        });
      }

      const profile = await readProfile(userId);
      expect(profile.wtpSignals).toHaveLength(200);
      expect(profile.wtpSignals[0].context).toBe('signal-10');
      expect(profile.wtpSignals[199].context).toBe('signal-209');
    });
  });

  describe('updateMomentum', () => {
    it('increments score and records last event', async () => {
      const userId = new mongoose.Types.ObjectId();

      await updateMomentum(userId, 'plan-accepted', 2);
      await updateMomentum(userId, 'spin-won', 3);

      const profile = await readProfile(userId);
      expect(profile.momentum.score).toBe(5);
      expect(profile.momentum.lastEventKind).toBe('spin-won');
      expect(profile.momentum.lastEventAt).toBeInstanceOf(Date);
    });

    it('supports negative deltas', async () => {
      const userId = new mongoose.Types.ObjectId();
      await updateMomentum(userId, 'plan-rejected', -3);
      const profile = await readProfile(userId);
      expect(profile.momentum.score).toBe(-3);
    });
  });

  describe('detectArchetype', () => {
    it('returns unknown when no signals', async () => {
      const userId = new mongoose.Types.ObjectId();
      await readProfile(userId);
      expect(await detectArchetype(userId)).toBe('unknown');
    });

    it('returns unknown for user with no profile', async () => {
      const userId = new mongoose.Types.ObjectId();
      expect(await detectArchetype(userId)).toBe('unknown');
    });

    it('returns builder after 10+ accepts', async () => {
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 10; i++) {
        await appendWtpSignal(userId, { kind: 'feature-accepted' });
      }
      expect(await detectArchetype(userId)).toBe('builder');
    });

    it('returns dabbler when rejects dominate', async () => {
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 5; i++) {
        await appendWtpSignal(userId, { kind: 'plan-rejected' });
      }
      await appendWtpSignal(userId, { kind: 'plan-accepted' });
      expect(await detectArchetype(userId)).toBe('dabbler');
    });

    it('returns professional on heavy power-tier purchases', async () => {
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 3; i++) {
        await appendWtpSignal(userId, {
          kind: 'delivery-accepted',
          featureTier: 'power',
          priceCents: 199,
        });
      }
      expect(await detectArchetype(userId)).toBe('professional');
    });

    it('returns hustler when spins dominate accepts', async () => {
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 6; i++) {
        await appendWtpSignal(userId, { kind: 'spin-won' });
      }
      await appendWtpSignal(userId, { kind: 'plan-accepted' });
      expect(await detectArchetype(userId)).toBe('hustler');
    });

    it('persists detected archetype on the profile doc', async () => {
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 10; i++) {
        await appendWtpSignal(userId, { kind: 'feature-accepted' });
      }
      await detectArchetype(userId);
      const doc = await SoulProfile.findOne({ userId });
      expect(doc!.archetype).toBe('builder');
    });
  });

  describe('buildSystemPromptSnippet', () => {
    it('includes archetype and momentum', async () => {
      const userId = new mongoose.Types.ObjectId();
      const profile = await readProfile(userId);
      const snippet = buildSystemPromptSnippet(profile);
      expect(snippet).toContain('archetype=unknown');
      expect(snippet).toContain('score=0');
    });

    it('includes preferences when present', async () => {
      const userId = new mongoose.Types.ObjectId();
      await SoulProfile.create({
        userId,
        preferences: {
          designStyle: 'brutalist',
          colorPalette: 'noir',
          verbosity: 'terse',
        },
      });
      const profile = await readProfile(userId);
      const snippet = buildSystemPromptSnippet(profile);
      expect(snippet).toContain('design=brutalist');
      expect(snippet).toContain('palette=noir');
      expect(snippet).toContain('verbosity=terse');
    });
  });

  describe('onTurnComplete', () => {
    it('writes both a signal and a momentum update', async () => {
      const userId = new mongoose.Types.ObjectId();

      await onTurnComplete(userId, {
        kind: 'delivery-accepted',
        featureTier: 'power',
        priceCents: 199,
      });

      const profile = await readProfile(userId);
      expect(profile.wtpSignals).toHaveLength(1);
      expect(profile.wtpSignals[0].kind).toBe('delivery-accepted');
      expect(profile.momentum.score).toBe(2);
      expect(profile.momentum.lastEventKind).toBe('delivery-accepted');
    });
  });
});

describe('GET /api/soul/me', () => {
  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/soul/me');
    expect(res.status).toBe(401);
  });

  it('returns a default profile for a first-time user', async () => {
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .get('/api/soul/me')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.userId).toBe(user.id);
    expect(res.body.profile.archetype).toBe('unknown');
    expect(res.body.profile.wtpSignals).toEqual([]);
    expect(res.body.profile.momentum.score).toBe(0);
  });

  it('returns persisted signals on subsequent reads', async () => {
    const { user, accessToken } = await createTestUser();
    const userId = new mongoose.Types.ObjectId(user.id);

    const signal: Omit<WtpSignal, 'createdAt'> = {
      kind: 'feature-accepted',
      featureTier: 'brains',
      priceCents: 79,
      context: 'added dark mode',
    };
    await appendWtpSignal(userId, signal);

    const res = await request(app)
      .get('/api/soul/me')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile.wtpSignals).toHaveLength(1);
    expect(res.body.profile.wtpSignals[0].kind).toBe('feature-accepted');
    expect(res.body.profile.wtpSignals[0].context).toBe('added dark mode');
  });

  it('isolates profiles per user', async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();

    await appendWtpSignal(new mongoose.Types.ObjectId(u1.user.id), {
      kind: 'plan-accepted',
    });

    const r1 = await request(app)
      .get('/api/soul/me')
      .set(getAuthHeader(u1.accessToken));
    const r2 = await request(app)
      .get('/api/soul/me')
      .set(getAuthHeader(u2.accessToken));

    expect(r1.body.profile.wtpSignals).toHaveLength(1);
    expect(r2.body.profile.wtpSignals).toHaveLength(0);
  });
});
