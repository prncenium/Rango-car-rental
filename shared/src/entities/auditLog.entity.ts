import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { ROLES } from '../enums/role.enum.js';
import { AUDIT_ACTIONS } from '../enums/auditAction.enum.js';
import { AUDIT_ENTITY_TYPES } from '../enums/auditEntityType.enum.js';

export const auditLogEntitySchema = z.object({
  _id: objectIdSchema,
  actor: objectIdSchema,
  actorRole: z.enum(ROLES), // snapshot of actor.role at the time of the action
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.enum(AUDIT_ENTITY_TYPES),
  entityId: objectIdSchema, // not a strict ref — polymorphic across entityType
  previousState: z.string().optional(),
  newState: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ipAddress: z.string().optional(),
  createdAt: z.coerce.date(),
});

export type AuditLogEntity = z.infer<typeof auditLogEntitySchema>;
