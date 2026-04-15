import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { SpreadsheetFile } from '../models/SpreadsheetFile';

const router = Router();

/** GET /api/spreadsheets — list user spreadsheets. */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const limit = Math.min(50, parseInt((req.query.limit as string) ?? '20', 10));
  const items = await SpreadsheetFile.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('title description sheets createdAt updatedAt')
    .lean();
  res.json({
    spreadsheets: items.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      description: s.description,
      sheetCount: s.sheets.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
});

/** GET /api/spreadsheets/:id — full spreadsheet for the viewer. */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const doc = await SpreadsheetFile.findOne({ _id: req.params.id, userId }).lean();
  if (!doc) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  res.json({
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    sheets: doc.sheets,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

/** PATCH /api/spreadsheets/:id — rename. */
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
  const doc = await SpreadsheetFile.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: parsed.data },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  res.json({ id: doc._id.toString(), title: doc.title });
});

/** DELETE /api/spreadsheets/:id — hard delete. */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const result = await SpreadsheetFile.deleteOne({ _id: req.params.id, userId });
  if (result.deletedCount === 0) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  res.status(204).end();
});

export default router;
