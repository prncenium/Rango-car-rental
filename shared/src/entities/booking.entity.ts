import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { BOOKING_STATUSES } from '../enums/bookingStatus.enum.js';
import { DEPOSIT_DEDUCTION_CATEGORIES } from '../enums/depositDeductionCategory.enum.js';

export const depositDeductionSchema = z.object({
  category: z.enum(DEPOSIT_DEDUCTION_CATEGORIES),
  amount: z.number().positive(),
  note: z.string().trim().min(1).max(500),
});

export const identityCheckSchema = z.object({
  passed: z.boolean(),
  licenceNumberSeen: z.string().trim().min(1),
  matchesRecord: z.boolean(),
  checkedBy: objectIdSchema,
  checkedAt: z.coerce.date(),
  notes: z.string().optional(), // required when passed = false or matchesRecord = false — enforced by guard, not schema
});

export const bookingEntitySchema = z.object({
  _id: objectIdSchema,
  car: objectIdSchema,
  renter: objectIdSchema,
  owner: objectIdSchema, // denormalized copy of Car.owner at request time

  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  days: z.number().int().positive(),

  ratePerDaySnapshot: z.number().positive(),
  weeklyRateSnapshot: z.number().positive().optional(),
  depositSnapshot: z.number().min(0),
  quotedTotalAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  lateFeeAmount: z.number().min(0).default(0),

  // Distance driven beyond the daily cap (specs/04-business-logic.md
  // §2.2a), computed at completion from odometerIn - odometerOut and the
  // car's extraKmRatePerKm snapshot at that moment. Absent until returned.
  excessKm: z.number().min(0).default(0),
  excessKmRateSnapshot: z.number().min(0).optional(),
  excessKmChargeAmount: z.number().min(0).default(0),

  amountReceived: z.number().default(0),
  depositReceived: z.number().default(0),
  depositReturned: z.number().default(0),
  depositRetained: z.number().default(0),
  depositRetainedAt: z.coerce.date().optional(),
  depositRetainedBy: objectIdSchema.optional(),
  depositDeductions: z.array(depositDeductionSchema).default([]),

  conditionNote: z.string().optional(),

  termsAcceptedAt: z.coerce.date(),

  status: z.enum(BOOKING_STATUSES).default('REQUESTED'),

  confirmedBy: objectIdSchema.optional(),
  confirmedAt: z.coerce.date().optional(),

  rejectedBy: objectIdSchema.optional(),
  rejectedAt: z.coerce.date().optional(),
  rejectionReason: z.string().optional(),

  handedOverAt: z.coerce.date().optional(),
  odometerOut: z.number().min(0).optional(),
  identityCheck: identityCheckSchema.optional(),
  overrideReason: z.string().optional(),

  returnedAt: z.coerce.date().optional(),
  odometerIn: z.number().min(0).optional(),

  terminatedAt: z.coerce.date().optional(),
  terminationReason: z.string().optional(),

  cancelledBy: objectIdSchema.optional(),
  cancellationReason: z.string().optional(),
  cancelledAt: z.coerce.date().optional(),

  cancellationRequestedBy: objectIdSchema.optional(),
  cancellationRequestReason: z.string().optional(),

  noShowAt: z.coerce.date().optional(),
  noShowBy: objectIdSchema.optional(),
  noShowReason: z.string().optional(),
  noShowCleared: z.boolean().default(false),
  noShowClearedBy: objectIdSchema.optional(),
  noShowClearedAt: z.coerce.date().optional(),
  noShowClearedReason: z.string().optional(),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type BookingEntity = z.infer<typeof bookingEntitySchema>;
export type DepositDeduction = z.infer<typeof depositDeductionSchema>;
export type IdentityCheck = z.infer<typeof identityCheckSchema>;
