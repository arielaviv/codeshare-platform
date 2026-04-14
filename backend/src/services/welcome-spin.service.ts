import mongoose from 'mongoose';
import { User } from '../models/User';
import { ApiError } from '../middleware/error.middleware';

export type SlotSymbol = 'gold' | 'feather' | 'seven' | 'tickets';

export interface SpinOutcome {
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  isWin: boolean;
  label: string;
}

export interface WelcomeSpinResult {
  spins: [SpinOutcome, SpinOutcome];
  awardedCents: number;
  newBalanceCents: number;
}

// Matches Base44's free tier (25 message credits at ~$0.20 each = $5)
export const WELCOME_BONUS_CENTS = 500;

// Deterministic staging: every user sees the same two-spin narrative.
// Spin 1 — near-miss. Spin 2 — jackpot. Credit granted on spin 2.
const STAGED_OUTCOMES: [SpinOutcome, SpinOutcome] = [
  { symbols: ['gold', 'gold', 'feather'], isWin: false, label: 'ANOTHER TURN' },
  { symbols: ['gold', 'gold', 'gold'], isWin: true, label: 'WINNER!' },
];

export async function claimWelcomeBonus(
  userId: mongoose.Types.ObjectId
): Promise<WelcomeSpinResult> {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  if (user.hasClaimedWelcomeBonus) {
    throw new ApiError('Welcome bonus already claimed', 409);
  }

  user.hasClaimedWelcomeBonus = true;
  user.creditsCents = (user.creditsCents || 0) + WELCOME_BONUS_CENTS;
  await user.save();

  return {
    spins: STAGED_OUTCOMES,
    awardedCents: WELCOME_BONUS_CENTS,
    newBalanceCents: user.creditsCents,
  };
}

export interface WelcomeSpinStatus {
  claimed: boolean;
  balanceCents: number;
}

export async function getWelcomeSpinStatus(
  userId: mongoose.Types.ObjectId
): Promise<WelcomeSpinStatus> {
  const user = await User.findById(userId).select('creditsCents hasClaimedWelcomeBonus');
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return {
    claimed: user.hasClaimedWelcomeBonus,
    balanceCents: user.creditsCents || 0,
  };
}
