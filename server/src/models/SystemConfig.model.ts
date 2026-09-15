import { Schema, model } from 'mongoose';

export interface SystemConfigDoc {
  _id: 'singleton';
  booking: {
    maxDurationDays: number;
    maxAdvanceDays: number;
    maxOpenRequestsPerUser: number;
    turnaroundBufferDays: number;
    defaultDepositAmount: number;
  };
  availability: {
    publicWindowDays: number;
  };
  security: {
    adminMaxConcurrentSessions: number; // 0 = unlimited
  };
  listing: {
    maxImagesPerCar: number;
  };
  platform: {
    registrationOpen: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const SystemConfigSchema = new Schema<SystemConfigDoc>(
  {
    _id: { type: String, enum: ['singleton'], required: true },
    booking: {
      maxDurationDays: { type: Number, default: 90, required: true },
      maxAdvanceDays: { type: Number, default: 365, required: true },
      maxOpenRequestsPerUser: { type: Number, default: 5, required: true },
      turnaroundBufferDays: { type: Number, default: 0, required: true, min: 0, max: 7 },
      defaultDepositAmount: { type: Number, default: 0, required: true },
    },
    availability: {
      publicWindowDays: { type: Number, default: 180, required: true },
    },
    security: {
      adminMaxConcurrentSessions: { type: Number, default: 0, required: true },
    },
    listing: {
      maxImagesPerCar: { type: Number, default: 12, required: true },
    },
    platform: {
      registrationOpen: { type: Boolean, default: true, required: true },
    },
  },
  { timestamps: true, _id: false },
);

export const SystemConfig = model<SystemConfigDoc>('SystemConfig', SystemConfigSchema);
