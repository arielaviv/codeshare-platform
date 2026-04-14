import mongoose from 'mongoose';
import { User } from '../models/User';
import { PrizeEvent } from '../models/PrizeEvent';
import { ApiError } from '../middleware/error.middleware';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_CENTS = 100; // $1
const MAX_CENTS = 300; // $3

export interface PrizeResult {
  amountCents: number;
  newBalanceCents: number;
  reason: string;
}

/**
 * Award a small bonus to the user. Rate-limited to one prize per 24 h per user.
 * Amount is randomized between $1 and $3.  Throws 429 when cooldown active.
 */
export async function awardPrize(
  userId: mongoose.Types.ObjectId,
  reason: string
): Promise<PrizeResult> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await PrizeEvent.findOne({ userId, createdAt: { $gte: since } });
  if (recent) {
    throw new ApiError('Prize cooldown active — user already won today', 429);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Random integer between MIN_CENTS and MAX_CENTS, snapped to $0.50 steps.
  const steps = Math.floor((MAX_CENTS - MIN_CENTS) / 50);
  const amountCents = MIN_CENTS + Math.floor(Math.random() * (steps + 1)) * 50;

  user.creditsCents = (user.creditsCents || 0) + amountCents;
  await user.save();

  await PrizeEvent.create({
    userId,
    amountCents,
    reason: reason.slice(0, 280),
    source: 'agent',
  });

  return {
    amountCents,
    newBalanceCents: user.creditsCents,
    reason: reason.slice(0, 280),
  };
}
