import { z } from 'zod';
import { BOARD_SLUGS } from './boards';

export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'moderator', 'mod', 'support',
  'deleted', 'anonymous', 'system', 'staff',
];

export const usernameSchema = z.string()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, '3-20 characters: letters, numbers, underscore only')
  .refine((username) => !RESERVED_USERNAMES.includes(username.toLowerCase()), 'This username is reserved');

export const postSchema = z.object({
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(1).max(10000),
  board: z.enum(BOARD_SLUGS),
});

export const commentSchema = z.object({
  postId: z.string().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
});

export const voteSchema = z.object({
  postId: z.string().min(1).max(40),
  type: z.enum(['UP', 'DOWN']),
});
