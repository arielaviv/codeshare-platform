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
});

export const classifyIntentSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(2000, 'Prompt cannot exceed 2000 characters'),
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
