import { z } from 'zod';

export const adminLoginSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(1).max(1024),
}).strict();
