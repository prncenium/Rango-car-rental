import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';

export const passwordResetEntitySchema = z.object({
  _id: objectIdSchema,
  user: objectIdSchema,
  tokenHash: z.string().min(1), // SHA-256 of the raw token; never the token
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PasswordResetEntity = z.infer<typeof passwordResetEntitySchema>;
