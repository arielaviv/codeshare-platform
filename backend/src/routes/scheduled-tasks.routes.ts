import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import cron from 'node-cron';
import { authenticate } from '../middleware/auth.middleware';
import { ScheduledTask } from '../models/ScheduledTask';
import { registerTask, unregisterTask } from '../services/scheduler.service';

const router = Router();

const MODE_ENUM = z.enum([
  'auto', 'code', 'research', 'sheet', 'visualization',
  'audio', 'video', 'chat', 'deck', 'design',
]);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(5000),
  mode: MODE_ENUM,
  cronExpression: z.string().min(5).max(60),
  timezone: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const items = await ScheduledTask.find({ userId }).sort({ updatedAt: -1 }).lean();
  res.json({
    tasks: items.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      prompt: t.prompt,
      mode: t.mode,
      cronExpression: t.cronExpression,
      timezone: t.timezone,
      enabled: t.enabled,
      lastRunAt: t.lastRunAt,
      runCount: t.runCount,
      lastRunSessionId: t.lastRunSessionId?.toString(),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
});

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
  if (!cron.validate(parsed.data.cronExpression)) {
    res.status(400).json({ message: 'Invalid cron expression' });
    return;
  }
  const task = await ScheduledTask.create({
    userId,
    ...parsed.data,
    enabled: parsed.data.enabled ?? true,
  });
  registerTask(task);
  res.status(201).json({
    id: task._id.toString(),
    title: task.title,
    cronExpression: task.cronExpression,
    enabled: task.enabled,
  });
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  mode: MODE_ENUM.optional(),
  cronExpression: z.string().min(5).max(60).optional(),
  timezone: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
});

router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request' });
    return;
  }
  if (parsed.data.cronExpression && !cron.validate(parsed.data.cronExpression)) {
    res.status(400).json({ message: 'Invalid cron expression' });
    return;
  }
  const task = await ScheduledTask.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: parsed.data },
    { new: true }
  );
  if (!task) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  registerTask(task);
  res.json({ id: task._id.toString(), enabled: task.enabled });
});

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const result = await ScheduledTask.deleteOne({ _id: req.params.id, userId });
  if (result.deletedCount === 0) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  unregisterTask(req.params.id);
  res.status(204).end();
});

export default router;
