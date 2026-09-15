import { Schema, model, type Types } from 'mongoose';

export interface PasswordResetDoc {
  user: Types.ObjectId;
  tokenHash: string; // SHA-256 of the raw token; never the token
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PasswordResetSchema = new Schema<PasswordResetDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

PasswordResetSchema.index({ tokenHash: 1 }, { unique: true });
PasswordResetSchema.index({ user: 1 });

export const PasswordReset = model<PasswordResetDoc>('PasswordReset', PasswordResetSchema);
