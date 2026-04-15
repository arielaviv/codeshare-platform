import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { UsageEvent } from '../models/UsageEvent';
import { ChatSession } from '../models/ChatSession';
import { Wallet } from '../models/Wallet';

const router = Router();

/**
 * GET /api/usage
 * Returns: balance + daily refresh + recent UsageEvents grouped by session.
 * This powers the Personalization > Usage tab (Manus images #33–34).
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const wallet = await Wallet.findOne({ userId }).lean();
  const balanceCents = wallet?.balanceCents ?? 0;

  // Aggregate UsageEvent by sessionId to produce per-session credit totals.
  const sessionAgg = await UsageEvent.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$sessionId',
        totalCostCents: { $sum: { $ifNull: ['$costCents', 0] } },
        eventCount: { $sum: 1 },
        lastAt: { $max: '$createdAt' },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 50 },
  ]);

  // Hydrate session titles for each row.
  const sessionIds = sessionAgg.map((row) => row._id).filter(Boolean);
  const sessions = await ChatSession.find({ _id: { $in: sessionIds } })
    .select('title')
    .lean();
  const titleById = new Map(sessions.map((s) => [s._id.toString(), s.title]));

  const records = sessionAgg.map((row) => {
    const sid = row._id ? row._id.toString() : null;
    return {
      sessionId: sid,
      title: sid ? titleById.get(sid) ?? 'Untitled session' : 'Free actions',
      date: row.lastAt,
      creditsChange: -row.totalCostCents, // displayed as negative spend
      eventCount: row.eventCount,
    };
  });

  res.json({
    balanceCents,
    dailyRefreshCents: 0, // TODO: per-tier daily refresh; UI shows the row only when > 0
    records,
  });
});

export default router;
