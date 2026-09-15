import { Schema, model, type Types } from 'mongoose';
import { ROLES, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type Role, type AuditAction, type AuditEntityType } from '@rango/shared';

export interface AuditLogDoc {
  actor: Types.ObjectId;
  actorRole: Role; // snapshot of actor.role at the time of the action
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId; // not a strict ref — polymorphic across entityType
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, enum: ROLES, required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, enum: AUDIT_ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    previousState: { type: String },
    newState: { type: String },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1 });

export const AuditLog = model<AuditLogDoc>('AuditLog', AuditLogSchema);
