import mongoose from 'mongoose';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { SlideDeck } from '../models/SlideDeck';
import { PrizeEvent } from '../models/PrizeEvent';

// Temu-style onboarding + retention carrots. Each milestone fires at most once
// per user (tracked via User.milestonesClaimed). A rolling 24-hour cap on total
// prize payouts prevents farming.

const DAILY_CAP_CENTS = 500; // $5 rolling 24 h (agent prizes + milestones + any)
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MilestoneAward {
  amountCents: number;
  newBalanceCents: number;
  reason: string;
  milestoneId: string;
}

export type MilestoneCategory = 'post' | 'deck' | 'deck-generated';

interface MilestoneDef {
  id: string;
  reason: string;
  amountCents: number;
  qualifies: (userId: mongoose.Types.ObjectId) => Promise<boolean>;
}

const POST_MILESTONES: MilestoneDef[] = [
  {
    id: 'first-post',
    reason: 'Published your first post',
    amountCents: 50,
    qualifies: async (userId) => (await Post.countDocuments({ userId })) === 1,
  },
  {
    id: 'third-post',
    reason: 'Three posts in! Keep sharing',
    amountCents: 75,
    qualifies: async (userId) => (await Post.countDocuments({ userId })) === 3,
  },
  {
    id: 'fifth-post',
    reason: 'Five posts shared with the community',
    amountCents: 100,
    qualifies: async (userId) => (await Post.countDocuments({ userId })) === 5,
  },
  {
    id: 'tenth-post',
    reason: 'Ten posts strong — on a roll!',
    amountCents: 150,
    qualifies: async (userId) => (await Post.countDocuments({ userId })) === 10,
  },
];

const DECK_MILESTONES: MilestoneDef[] = [
  {
    id: 'first-deck',
    reason: 'Your first Mr8 slide deck',
    amountCents: 100,
    qualifies: async (userId) => (await SlideDeck.countDocuments({ userId })) === 1,
  },
  {
    id: 'third-deck',
    reason: 'Three decks shipped — style on point',
    amountCents: 150,
    qualifies: async (userId) => (await SlideDeck.countDocuments({ userId })) === 3,
  },
  {
    id: 'fifth-deck',
    reason: 'Five decks and counting',
    amountCents: 200,
    qualifies: async (userId) => (await SlideDeck.countDocuments({ userId })) === 5,
  },
];

// Milestones for AI-generated decks specifically (separate from total deck count)
const DECK_GENERATED_MILESTONES: MilestoneDef[] = [
  {
    id: 'first-ai-deck',
    reason: 'Your first AI-generated deck',
    amountCents: 100,
    qualifies: async (userId) => {
      // Any existing AI deck means this is at least the first (we count by total since
      // generated decks get persisted via SlideDeck.save).
      return (await SlideDeck.countDocuments({ userId })) === 1;
    },
  },
];

async function sumPrizesInWindow(userId: mongoose.Types.ObjectId): Promise<number> {
  const since = new Date(Date.now() - ROLLING_WINDOW_MS);
  const recent = await PrizeEvent.find({ userId, createdAt: { $gte: since } });
  return recent.reduce((sum, p) => sum + p.amountCents, 0);
}

export async function checkAndAwardMilestone(
  userId: mongoose.Types.ObjectId,
  category: MilestoneCategory
): Promise<MilestoneAward | null> {
  const user = await User.findById(userId);
  if (!user) return null;

  const defs =
    category === 'post'
      ? POST_MILESTONES
      : category === 'deck-generated'
        ? DECK_GENERATED_MILESTONES
        : DECK_MILESTONES;

  for (const def of defs) {
    const claimed = user.milestonesClaimed || [];
    if (claimed.includes(def.id)) continue;

    const qualifies = await def.qualifies(userId);
    if (!qualifies) continue;

    // Rolling 24 h cap — prevents farming across many milestones in one day
    const spent = await sumPrizesInWindow(userId);
    if (spent + def.amountCents > DAILY_CAP_CENTS) return null;

    user.creditsCents = (user.creditsCents || 0) + def.amountCents;
    user.milestonesClaimed = [...claimed, def.id];
    await user.save();

    await PrizeEvent.create({
      userId,
      amountCents: def.amountCents,
      reason: def.reason,
      source: 'milestone',
    });

    return {
      amountCents: def.amountCents,
      newBalanceCents: user.creditsCents,
      reason: def.reason,
      milestoneId: def.id,
    };
  }

  return null;
}
