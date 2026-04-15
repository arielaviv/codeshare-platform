import mongoose from 'mongoose';
import { SoulProfile, type ISoulProfile } from '../models/SoulProfile';
import type {
  SoulArchetype,
  SoulProfile as SoulProfileShape,
  WtpSignal,
  WtpSignalKind,
} from '../types/soul';

const MAX_SIGNALS = 200;

type UserIdInput = string | mongoose.Types.ObjectId;

function toObjectId(userId: UserIdInput): mongoose.Types.ObjectId {
  return typeof userId === 'string'
    ? new mongoose.Types.ObjectId(userId)
    : userId;
}

function toShape(doc: ISoulProfile): SoulProfileShape {
  return {
    userId: doc.userId.toString(),
    preferences: {
      designStyle: doc.preferences?.designStyle,
      colorPalette: doc.preferences?.colorPalette,
      frameworks: doc.preferences?.frameworks,
      verbosity: doc.preferences?.verbosity,
    },
    wtpSignals: doc.wtpSignals.map((s) => ({
      kind: s.kind,
      featureTier: s.featureTier,
      priceCents: s.priceCents,
      context: s.context,
      createdAt: s.createdAt,
    })),
    interactionMode: doc.interactionMode,
    momentum: {
      score: doc.momentum?.score ?? 0,
      lastEventAt: doc.momentum?.lastEventAt,
      lastEventKind: doc.momentum?.lastEventKind,
    },
    conversionTriggers: [...doc.conversionTriggers],
    aversions: [...doc.aversions],
    archetype: doc.archetype,
    updatedAt: doc.updatedAt,
  };
}

export async function readProfile(
  userId: UserIdInput
): Promise<SoulProfileShape> {
  const oid = toObjectId(userId);
  const existing = await SoulProfile.findOne({ userId: oid });
  if (existing) return toShape(existing);

  const created = await SoulProfile.create({ userId: oid });
  return toShape(created);
}

export async function appendWtpSignal(
  userId: UserIdInput,
  signal: Omit<WtpSignal, 'createdAt'> & { createdAt?: Date }
): Promise<void> {
  const oid = toObjectId(userId);
  const entry: WtpSignal = {
    kind: signal.kind,
    featureTier: signal.featureTier,
    priceCents: signal.priceCents,
    context: signal.context,
    createdAt: signal.createdAt ?? new Date(),
  };

  await SoulProfile.updateOne(
    { userId: oid },
    {
      $setOnInsert: { userId: oid },
      $push: {
        wtpSignals: {
          $each: [entry],
          $slice: -MAX_SIGNALS,
        },
      },
    },
    { upsert: true }
  );
}

export async function updateMomentum(
  userId: UserIdInput,
  eventKind: string,
  delta: number
): Promise<void> {
  const oid = toObjectId(userId);
  await SoulProfile.updateOne(
    { userId: oid },
    {
      $setOnInsert: { userId: oid },
      $inc: { 'momentum.score': delta },
      $set: {
        'momentum.lastEventAt': new Date(),
        'momentum.lastEventKind': eventKind,
      },
    },
    { upsert: true }
  );
}

function classifyArchetype(signals: WtpSignal[]): SoulArchetype {
  if (signals.length === 0) return 'unknown';

  const counts: Record<WtpSignalKind, number> = {
    'plan-accepted': 0,
    'plan-rejected': 0,
    'feature-accepted': 0,
    'feature-rejected': 0,
    'spin-won': 0,
    'spin-lost': 0,
    'powerup-claimed': 0,
    'delivery-accepted': 0,
    'delivery-rejected': 0,
  };
  for (const s of signals) counts[s.kind]++;

  const accepts =
    counts['plan-accepted'] +
    counts['feature-accepted'] +
    counts['delivery-accepted'];
  const rejects =
    counts['plan-rejected'] +
    counts['feature-rejected'] +
    counts['delivery-rejected'];
  const spins = counts['spin-won'] + counts['spin-lost'];
  const powerTierPurchases = signals.filter(
    (s) =>
      s.featureTier === 'power' &&
      (s.kind === 'feature-accepted' || s.kind === 'delivery-accepted')
  ).length;

  if (powerTierPurchases >= 3) return 'professional';
  if (spins >= 5 && spins > accepts) return 'hustler';
  if (accepts >= 10) return 'builder';
  if (rejects > accepts && rejects >= 3) return 'dabbler';
  return 'unknown';
}

export async function detectArchetype(
  userId: UserIdInput
): Promise<SoulArchetype> {
  const oid = toObjectId(userId);
  const doc = await SoulProfile.findOne({ userId: oid });
  if (!doc) return 'unknown';
  const archetype = classifyArchetype(doc.wtpSignals);
  if (archetype !== doc.archetype) {
    doc.archetype = archetype;
    await doc.save();
  }
  return archetype;
}

const MOMENTUM_DELTAS: Record<WtpSignalKind, number> = {
  'plan-accepted': 1,
  'plan-rejected': -1,
  'feature-accepted': 1,
  'feature-rejected': -1,
  'spin-won': 2,
  'spin-lost': 0,
  'powerup-claimed': 1,
  'delivery-accepted': 2,
  'delivery-rejected': -2,
};

export interface TurnEvent {
  kind: WtpSignalKind;
  featureTier?: 'polish' | 'brains' | 'power';
  priceCents?: number;
  context?: string;
}

export async function onTurnComplete(
  userId: UserIdInput,
  event: TurnEvent
): Promise<void> {
  try {
    await appendWtpSignal(userId, {
      kind: event.kind,
      featureTier: event.featureTier,
      priceCents: event.priceCents,
      context: event.context,
    });
    const delta = MOMENTUM_DELTAS[event.kind] ?? 0;
    await updateMomentum(userId, event.kind, delta);
  } catch {
    // SOUL writes are best-effort; never fail the agent turn on profile errors.
  }
}

export function buildSystemPromptSnippet(profile: SoulProfileShape): string {
  const prefBits: string[] = [];
  if (profile.preferences.designStyle) {
    prefBits.push(`design=${profile.preferences.designStyle}`);
  }
  if (profile.preferences.colorPalette) {
    prefBits.push(`palette=${profile.preferences.colorPalette}`);
  }
  if (profile.preferences.verbosity) {
    prefBits.push(`verbosity=${profile.preferences.verbosity}`);
  }
  if (profile.preferences.frameworks && profile.preferences.frameworks.length) {
    prefBits.push(`frameworks=${profile.preferences.frameworks.slice(0, 3).join(',')}`);
  }
  const prefs = prefBits.slice(0, 3).join('; ') || 'none yet';

  const momentum = profile.momentum;
  const lastKind = momentum.lastEventKind ?? 'none';
  const score = momentum.score ?? 0;
  const mood =
    score > 2 ? 'winning streak' : score < -2 ? 'frustrated' : 'neutral';

  return `USER PROFILE (SOUL): archetype=${profile.archetype}; preferences: ${prefs}; momentum: score=${score} (${mood}), last=${lastKind}. Use this to personalize choices, tone, and which agent tools to call — but never mention the profile directly.`;
}
