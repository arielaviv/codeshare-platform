import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z
    .string()
    .email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password cannot exceed 100 characters'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  bio: z
    .string()
    .max(500, 'Bio cannot exceed 500 characters')
    .optional(),
});

export const createPostSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters'),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(10000, 'Code cannot exceed 10000 characters'),
  language: z
    .string()
    .min(1, 'Language is required'),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
});

export const updatePostSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .optional(),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(10000, 'Code cannot exceed 10000 characters')
    .optional(),
  language: z
    .string()
    .min(1, 'Language is required')
    .optional(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
});

export const commentSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(500, 'Comment cannot exceed 500 characters'),
});

const slideTypeEnum = z.enum([
  'title',
  'bullets',
  'two-column',
  'image',
  'chart-bar',
  'chart-line',
  'chart-pie',
  'stat',
  'quote',
  'comparison',
]);

const paletteEnum = z.enum(['dark', 'light', 'gartner-blue', 'gartner-warm']);

const themeInputSchema = z.object({
  palette: paletteEnum,
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Accent color must be a 6-digit hex'),
  fontFamily: z.string().min(1).max(200),
});

const slideInputSchema = z.object({
  id: z.string().min(1, 'Slide id is required'),
  type: slideTypeEnum,
  content: z.record(z.unknown()),
  elements: z.array(z.record(z.unknown())).optional(),
  notes: z.string().max(2000).optional(),
});

export const createDeckSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  theme: themeInputSchema.optional(),
  slides: z
    .array(slideInputSchema)
    .max(50, 'Decks cannot exceed 50 slides')
    .optional(),
  isPublic: z.boolean().optional(),
});

export const updateDeckSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .optional(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  theme: themeInputSchema.optional(),
  slides: z
    .array(slideInputSchema)
    .max(50, 'Decks cannot exceed 50 slides')
    .optional(),
  isPublic: z.boolean().optional(),
  thumbnail: z.string().max(500).optional(),
});

const researchBriefSchema = z.object({
  query: z.string(),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string(),
      relevance: z.number(),
    })
  ),
  durationMs: z.number(),
  cappedAt: z.enum(['actions', 'time']).optional(),
});

export const generateDeckSchema = z.object({
  topic: z
    .string()
    .min(3, 'Topic must be at least 3 characters')
    .max(500, 'Topic cannot exceed 500 characters'),
  slideCount: z
    .number()
    .int()
    .min(3, 'Minimum 3 slides')
    .max(20, 'Maximum 20 slides'),
  style: z.enum(['professional', 'casual', 'academic']).optional(),
  templateId: z.string().max(100).optional(),
  researchBrief: researchBriefSchema.optional(),
  /** When true, skip the inline browser research step. Default false. */
  skipResearch: z.boolean().optional(),
});

export const generateBookSchema = z.object({
  prompt: z
    .string()
    .min(5, 'Prompt must be at least 5 characters')
    .max(5000, 'Prompt cannot exceed 5000 characters'),
  targetWords: z
    .number()
    .int()
    .min(500, 'Target must be at least 500 words')
    .max(120000, 'Target cannot exceed 120,000 words')
    .optional(),
  sessionId: z.string().optional(),
});

export const generateBookCoverSchema = z.object({
  bookId: z
    .string()
    .min(1, 'bookId is required')
    .max(64, 'bookId too long'),
  regenerateIdx: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional(),
  author: z
    .string()
    .max(120, 'Author name too long')
    .optional(),
  sessionId: z.string().optional(),
});

export const selectCoverSchema = z.object({
  selectedCoverIdx: z.number().int().min(1).max(12),
});

export const updateBookSchema = z
  .object({
    themeId: z
      .enum([
        'literary-classic',
        'literary-modern',
        'thriller-tight',
        'children-warm',
        'nonfiction-clean',
        'memoir-warm',
      ])
      .optional(),
    author: z.string().max(120, 'Author name too long').optional(),
    title: z.string().min(1).max(200).optional(),
    bio: z.string().max(500).optional(),
    dedication: z.string().max(500).optional(),
    epigraph: z.string().max(500).optional(),
    acknowledgements: z.string().max(2000).optional(),
    copyrightPageText: z.string().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

/**
 * Manual-prose patch for a single chapter. Frontend ChapterProseEditor
 * debounces and sends this per variant. The backend persists to
 * `chapter.manualText[variant]` + best-effort syncs to the E2B sandbox.
 */
export const updateChapterProseSchema = z.object({
  text: z.string().max(50_000, 'Chapter too long'),
  variant: z.enum(['draft', 'edited', 'proofed']),
});

/**
 * Replace the book's chapters array (reorder, rename, insert, delete).
 * The backend renumbers `n` fields in server order and archives any sandbox
 * file for a chapter number that no longer exists.
 */
export const replaceChaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        n: z.number().int().min(1).max(100),
        title: z.string().min(1).max(200),
        beat: z.string().max(3000),
        estimatedWords: z.number().int().min(0).max(20_000),
        /** Omitted on inserts; preserved on reorders/renames so we don't lose draft prose. */
        status: z
          .enum(['pending', 'drafting', 'drafted', 'editing', 'edited', 'proofing', 'proofed', 'error'])
          .optional(),
        draftPath: z.string().max(200).optional(),
        editedPath: z.string().max(200).optional(),
        proofedPath: z.string().max(200).optional(),
        wordCount: z.number().int().min(0).optional(),
      })
    )
    .min(1, 'Book must have at least one chapter')
    .max(60, 'Too many chapters'),
});

export const classifyIntentSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(2000, 'Prompt cannot exceed 2000 characters'),
});

export const planBookSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(5000, 'Prompt cannot exceed 5000 characters'),
});

export const draftBookSchema = z.object({
  bookId: z.string().min(1).max(64),
  stage: z.enum(['voice-check', 'remaining', 'regenerate-chapter']),
  chapterN: z.number().int().min(1).max(100).optional(),
  directive: z.string().max(2000).optional(),
  sessionId: z.string().optional(),
}).refine(
  (v) => v.stage !== 'regenerate-chapter' || typeof v.chapterN === 'number',
  { message: 'chapterN is required when stage is regenerate-chapter' }
);

export const approveBookSchema = z.object({
  approvalId: z.string().min(1).max(64),
  choice: z.string().min(1).max(120),
  meta: z.record(z.unknown()).optional(),
});

export const polishBookSchema = z.object({
  bookId: z.string().min(1).max(64),
  aggressiveness: z.enum(['light', 'standard', 'heavy']),
  directives: z.string().max(1000).optional(),
  skipAudit: z.boolean().optional(),
  sessionId: z.string().optional(),
});

export const auditBookSchema = z.object({
  bookId: z.string().min(1).max(64),
  sessionId: z.string().optional(),
});

export const reEditChapterSchema = z.object({
  bookId: z.string().min(1).max(64),
  chapterN: z.number().int().min(1).max(100),
  aggressiveness: z.enum(['light', 'standard', 'heavy']),
  directives: z.string().max(1000).optional(),
  sessionId: z.string().optional(),
});

export const formatBookSchema = z.object({
  bookId: z.string().min(1).max(64),
  formats: z.array(z.enum(['pdf', 'epub', 'docx'])).min(1).max(3).optional(),
  forceReformat: z.boolean().optional(),
  sessionId: z.string().optional(),
});

export const bundleBookSchema = z.object({
  bookId: z.string().min(1).max(64),
  sessionId: z.string().optional(),
});

export const acceptDeliverySchema = z.object({
  planId: z
    .string()
    .min(1, 'planId is required')
    .max(100, 'planId cannot exceed 100 characters'),
  priceCents: z
    .number()
    .int()
    .min(0, 'priceCents cannot be negative')
    .max(100000, 'priceCents cannot exceed $1000'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type GenerateDeckInput = z.infer<typeof generateDeckSchema>;
export type ClassifyIntentInput = z.infer<typeof classifyIntentSchema>;
export type GenerateBookInput = z.infer<typeof generateBookSchema>;
export type GenerateBookCoverInput = z.infer<typeof generateBookCoverSchema>;
export type SelectCoverInput = z.infer<typeof selectCoverSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type PlanBookInput = z.infer<typeof planBookSchema>;
export type DraftBookInput = z.infer<typeof draftBookSchema>;
export type ApproveBookInput = z.infer<typeof approveBookSchema>;
export type PolishBookInput = z.infer<typeof polishBookSchema>;
export type AuditBookInput = z.infer<typeof auditBookSchema>;
export type ReEditChapterInput = z.infer<typeof reEditChapterSchema>;
export type FormatBookInput = z.infer<typeof formatBookSchema>;
export type BundleBookInput = z.infer<typeof bundleBookSchema>;
export type UpdateChapterProseInput = z.infer<typeof updateChapterProseSchema>;
export type ReplaceChaptersInput = z.infer<typeof replaceChaptersSchema>;
export type AcceptDeliveryInput = z.infer<typeof acceptDeliverySchema>;
