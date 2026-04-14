import type { SpinOutcome, SlotSymbol } from '../components/SlotMachine';
import type { FeatureTier, TierWeights } from '../types/blueprint';

const TIER_SYMBOL: Record<FeatureTier, SlotSymbol> = {
  polish: 'feather',
  brains: 'seven',
  power: 'gold',
};

const TIER_AWARD_CENTS: Record<FeatureTier, number> = {
  polish: 19,
  brains: 79,
  power: 199,
};

export function pickTier(weights: TierWeights, rng: () => number = Math.random): FeatureTier {
  const total = weights.polish + weights.brains + weights.power;
  if (total <= 0) return 'polish';
  const roll = rng() * total;
  if (roll < weights.polish) return 'polish';
  if (roll < weights.polish + weights.brains) return 'brains';
  return 'power';
}

export function outcomesForTier(tier: FeatureTier): [SpinOutcome, SpinOutcome] {
  const winSym = TIER_SYMBOL[tier];
  return [
    {
      symbols: [winSym, winSym, 'tickets'],
      isWin: false,
      label: 'ANOTHER TURN',
    },
    {
      symbols: [winSym, winSym, winSym],
      isWin: true,
      label: 'WINNER!',
    },
  ];
}

export function awardCentsForTier(tier: FeatureTier): number {
  return TIER_AWARD_CENTS[tier];
}

export const JACKPOT_WEIGHTS: TierWeights = { polish: 0, brains: 0, power: 1 };
