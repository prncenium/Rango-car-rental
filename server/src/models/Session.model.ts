import { Schema, model, type Types } from 'mongoose';
import { SESSION_STATUSES, SESSION_REVOKED_REASONS, type SessionStatus, type SessionRevokedReason } from '@rango/shared';

export interface SessionDoc {
  user: Types.ObjectId;
  refreshTokenHash: string; // SHA-256 of the raw token; never the token
  family: string; // rotation lineage id, constant across rotations
  status: SessionStatus;
  revokedReason?: SessionRevokedReason;
  userAgent?: string;
  ipAddress?: string;
  lastUsedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SessionSchema = new Schema<SessionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    family: { type: String, required: true },
    status: { type: String, enum: SESSION_STATUSES, default: 'ACTIVE', required: true },
    revokedReason: { type: String, enum: SESSION_REVOKED_REASONS },
    userAgent: { type: String },
    ipAddress: { type: String },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

SessionSchema.index({ user: 1, status: 1 });
SessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
SessionSchema.index({ family: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL sweep of expired rows — the only clock-driven mechanism in the platform

export const Session = model<SessionDoc>('Session', SessionSchema);
