import { Schema, model, type Types } from 'mongoose';
import { BOOKING_STATUSES, DEPOSIT_DEDUCTION_CATEGORIES, type BookingStatus } from '@rango/shared';

export interface DepositDeduction {
  category: (typeof DEPOSIT_DEDUCTION_CATEGORIES)[number];
  amount: number;
  note: string;
}

export interface IdentityCheck {
  passed: boolean;
  licenceNumberSeen: string;
  matchesRecord: boolean;
  checkedBy: Types.ObjectId;
  checkedAt: Date;
  notes?: string;
}

export interface BookingDoc {
  car: Types.ObjectId;
  renter: Types.ObjectId;
  owner: Types.ObjectId; // denormalized copy of Car.owner at request time

  startDate: Date;
  endDate: Date;
  days: number;

  ratePerDaySnapshot: number;
  weeklyRateSnapshot?: number;
  depositSnapshot: number;
  quotedTotalAmount: number;
  totalAmount: number;
  lateFeeAmount: number;

  amountReceived: number;
  depositReceived: number;
  depositReturned: number;
  depositRetained: number;
  depositRetainedAt?: Date;
  depositRetainedBy?: Types.ObjectId;
  depositDeductions: DepositDeduction[];

  conditionNote?: string;

  status: BookingStatus;

  confirmedBy?: Types.ObjectId;
  confirmedAt?: Date;

  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;

  handedOverAt?: Date;
  odometerOut?: number;
  identityCheck?: IdentityCheck;
  overrideReason?: string;

  returnedAt?: Date;
  odometerIn?: number;

  terminatedAt?: Date;
  terminationReason?: string;

  cancelledBy?: Types.ObjectId;
  cancellationReason?: string;
  cancelledAt?: Date;

  cancellationRequestedBy?: Types.ObjectId;
  cancellationRequestReason?: string;

  noShowAt?: Date;
  noShowBy?: Types.ObjectId;
  noShowReason?: string;
  noShowCleared: boolean;
  noShowClearedBy?: Types.ObjectId;
  noShowClearedAt?: Date;
  noShowClearedReason?: string;

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

const IdentityCheckSchema = new Schema<IdentityCheck>(
  {
    passed: { type: Boolean, required: true },
    licenceNumberSeen: { type: String, required: true },
    matchesRecord: { type: Boolean, required: true },
    checkedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    checkedAt: { type: Date, required: true },
    notes: { type: String },
  },
  { _id: false },
);

export const BookingSchema = new Schema<BookingDoc>(
  {
    car: { type: Schema.Types.ObjectId, ref: 'Car', required: true },
    renter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true },

    ratePerDaySnapshot: { type: Number, required: true },
    weeklyRateSnapshot: { type: Number },
    depositSnapshot: { type: Number, required: true },
    quotedTotalAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    lateFeeAmount: { type: Number, default: 0, required: true },

    amountReceived: { type: Number, default: 0, required: true },
    depositReceived: { type: Number, default: 0, required: true },
    depositReturned: { type: Number, default: 0, required: true },
    depositRetained: { type: Number, default: 0, required: true },
    depositRetainedAt: { type: Date },
    depositRetainedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    depositDeductions: { type: [DepositDeductionSchema], default: [] },

    conditionNote: { type: String },

    status: { type: String, enum: BOOKING_STATUSES, default: 'REQUESTED', required: true },

    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },

    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },

    handedOverAt: { type: Date },
    odometerOut: { type: Number },
    identityCheck: { type: IdentityCheckSchema },
    overrideReason: { type: String },

    returnedAt: { type: Date },
    odometerIn: { type: Number },

    terminatedAt: { type: Date },
    terminationReason: { type: String },

    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },

    cancellationRequestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancellationRequestReason: { type: String },

    noShowAt: { type: Date },
    noShowBy: { type: Schema.Types.ObjectId, ref: 'User' },
    noShowReason: { type: String },
    noShowCleared: { type: Boolean, default: false, required: true },
    noShowClearedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    noShowClearedAt: { type: Date },
    noShowClearedReason: { type: String },
  },
  { timestamps: true },
);

BookingSchema.index({ car: 1, startDate: 1, endDate: 1 });
BookingSchema.index({ renter: 1, status: 1 });
BookingSchema.index({ owner: 1, status: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ status: 1, startDate: 1 });

export const Booking = model<BookingDoc>('Booking', BookingSchema);
