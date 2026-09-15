import { Schema, model } from 'mongoose';
import { ROLES, type Role } from '@rango/shared';

export interface UserDoc {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  drivingLicence: {
    number: string;
    expiryDate?: Date;
    enteredAt: Date;
    updatedAt?: Date;
  };
  failedLoginCount: number;
  lockedUntil?: Date;
  lastFailedLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'USER', required: true },
    isActive: { type: Boolean, default: true, required: true },
    drivingLicence: {
      number: { type: String, required: true, uppercase: true, trim: true },
      expiryDate: { type: Date },
      enteredAt: { type: Date, required: true },
      updatedAt: { type: Date },
    },
    failedLoginCount: { type: Number, default: 0, required: true },
    lockedUntil: { type: Date },
    lastFailedLoginAt: { type: Date },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

export const User = model<UserDoc>('User', UserSchema);
