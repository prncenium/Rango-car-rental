import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { SESSION_STATUSES } from '../enums/sessionStatus.enum.js';
import { SESSION_REVOKED_REASONS } from '../enums/sessionRevokedReason.enum.js';

export const sessionEntitySchema = z.object({
  _id: objectIdSchema,
  user: objectIdSchema,
  refreshTokenHash: z.string().min(1), // SHA-256 of the raw token; never the token
  family: z.string().min(1), // rotation lineage id, constant across rotations
  status: z.enum(SESSION_STATUSES).default('ACTIVE'),
  revokedReason: z.enum(SESSION_REVOKED_REASONS).optional(),
  userAgent: z.string().max(200).optional(),
  ipAddress: z.string().optional(),
  lastUsedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type SessionEntity = z.infer<typeof sessionEntitySchema>;
