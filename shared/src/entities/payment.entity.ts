import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { PAYMENT_METHODS } from '../enums/paymentMethod.enum.js';
import { PAYMENT_STATUSES } from '../enums/paymentStatus.enum.js';
import { PAYMENT_DIRECTIONS } from '../enums/paymentDirection.enum.js';
import { PAYMENT_PURPOSES } from '../enums/paymentPurpose.enum.js';
import { depositDeductionSchema } from './booking.entity.js';

export const paymentEntitySchema = z.object({
  _id: objectIdSchema,
  booking: objectIdSchema, // the only parent a payment can have
  amount: z.number().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  direction: z.enum(PAYMENT_DIRECTIONS),
  purpose: z.enum(PAYMENT_PURPOSES),
  status: z.enum(PAYMENT_STATUSES).default('PENDING'),
  refundOf: objectIdSchema.optional(), // set only when direction = OUT and this is a refund
  deductions: z.array(depositDeductionSchema).optional(),
  recordedBy: objectIdSchema,
  settledAt: z.coerce.date().optional(),
  voidedAt: z.coerce.date().optional(),
  voidReason: z.string().optional(),
  referenceNote: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PaymentEntity = z.infer<typeof paymentEntitySchema>;
