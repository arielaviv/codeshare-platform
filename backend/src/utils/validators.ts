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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
