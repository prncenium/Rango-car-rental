import { Schema, model, type Types } from 'mongoose';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_DIRECTIONS,
  PAYMENT_PURPOSES,
  DEPOSIT_DEDUCTION_CATEGORIES,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentDirection,
  type PaymentPurpose,
} from '@rango/shared';
import type { DepositDeduction } from './Booking.model.js';

export interface PaymentDoc {
  booking: Types.ObjectId; // the only parent a payment can have
  amount: number;
  paymentMethod: PaymentMethod;
  direction: PaymentDirection;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  refundOf?: Types.ObjectId; // set only when direction = OUT and this is a refund
  deductions?: DepositDeduction[];
  recordedBy: Types.ObjectId;
  settledAt?: Date;
  voidedAt?: Date;
  voidReason?: string;
  referenceNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepositDeductionSchema = new Schema<DepositDeduction>(
  {
    category: { type: String, enum: DEPOSIT_DEDUCTION_CATEGORIES, required: true },
    amount: { type: Number, required: true },
    note: { type: String, required: true },
  },
  { _id: false },
);

export const PaymentSchema = new Schema<PaymentDoc>(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    direction: { type: String, enum: PAYMENT_DIRECTIONS, required: true },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING', required: true },
    refundOf: { type: Schema.Types.ObjectId, ref: 'Payment' },
    deductions: { type: [DepositDeductionSchema] },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    settledAt: { type: Date },
    voidedAt: { type: Date },
    voidReason: { type: String },
    referenceNote: { type: String },
  },
  { timestamps: true },
);

PaymentSchema.index({ booking: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ booking: 1, purpose: 1, direction: 1 });

export const Payment = model<PaymentDoc>('Payment', PaymentSchema);
