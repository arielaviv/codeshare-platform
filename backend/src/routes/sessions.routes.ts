import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { ChatSession, type ChatSessionSkill } from '../models/ChatSession';
import { nameSessionAsync, inferSkillFromPrompt } from '../services/session-naming.service';

const router = Router();

const createSchema = z.object({
  firstUserMessage: z.string().min(1).max(5000),
  skill: z.enum(['apps', 'slides', 'sheet', 'design', 'mixed', 'unknown']).optional(),
});

/** POST /api/sessions — create a new chat session. Names asynchronously. */
router.post('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten() });
    return;
  }

  const inferredSkill: ChatSessionSkill = parsed.data.skill ?? inferSkillFromPrompt(parsed.data.firstUserMessage);
  const truncated = parsed.data.firstUserMessage.slice(0, 60);

  const session = await ChatSession.create({
    userId,
    firstUserMessage: parsed.data.firstUserMessage,
    title: truncated, // optimistic title; replaced when Haiku finishes
    titleStatus: 'pending',
    skill: inferredSkill,
    messageCount: 1,
  });

  // Fire async naming; don't await — frontend polls or listens via SSE later.
  void nameSessionAsync(session._id.toString(), parsed.data.firstUserMessage);

  res.status(201).json({ id: session._id.toString(), title: session.title, skill: session.skill });
});

/** GET /api/sessions — list user sessions (paginated). */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const limit = Math.min(50, parseInt((req.query.limit as string) ?? '20', 10));

  const sessions = await ChatSession.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('title titleStatus skill messageCount unreadCount createdAt updatedAt')
    .lean();

  res.json({
    sessions: sessions.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      titleStatus: s.titleStatus,
      skill: s.skill,
      messageCount: s.messageCount,
      unreadCount: s.unreadCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
});

/** GET /api/sessions/:id — fetch a single session (for title polling / metatitle). */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const session = await ChatSession.findOne({ _id: req.params.id, userId }).lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.json({
    id: session._id.toString(),
    title: session.title,
    titleStatus: session.titleStatus,
    skill: session.skill,
    firstUserMessage: session.firstUserMessage,
    messageCount: session.messageCount,
    unreadCount: session.unreadCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  unreadCount: z.number().int().min(0).optional(),
  closedAt: z.coerce.date().optional(),
});

/** PATCH /api/sessions/:id — title rename, mark read, close. */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten() });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) {
    update.title = parsed.data.title;
    update.titleStatus = 'named';
  }
  if (parsed.data.unreadCount !== undefined) update.unreadCount = parsed.data.unreadCount;
  if (parsed.data.closedAt !== undefined) update.closedAt = parsed.data.closedAt;

  const session = await ChatSession.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: update },
    { new: true }
  );
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.json({ id: session._id.toString(), title: session.title });
});

/** DELETE /api/sessions/:id — hard delete; for Data controls "Clear chat history". */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const result = await ChatSession.deleteOne({ _id: req.params.id, userId });
  if (result.deletedCount === 0) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.status(204).end();
});

export default router;
