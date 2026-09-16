import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, PAYMENT_DIRECTIONS, PAYMENT_METHODS, PAYMENT_PURPOSES, PAYMENT_STATUSES } from '@rango/shared';
import {
  adminListPayments,
  recordPayment,
  refundPayment,
  settlePayment,
  voidPayment,
} from '../services/payment.service.js';

const router = Router();

// ADM-05 — payment list. confirm-offline-payment (the one-click
// PENDING+SETTLED shortcut) stays under
// /api/admin/bookings/:bookingId/confirm-offline-payment.
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  booking: objectIdSchema.optional(),
  direction: z.enum(PAYMENT_DIRECTIONS).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  purpose: z.enum(PAYMENT_PURPOSES).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await adminListPayments(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

const paymentIdParams = z.object({ paymentId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });

// PAY-06 — record an expected payment, PENDING, separate from
// confirm-offline-payment's one-click PENDING+SETTLED shortcut.
const recordBody = z.strictObject({
  bookingId: objectIdSchema,
  amount: z.number().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  purpose: z.enum(PAYMENT_PURPOSES).default('RENTAL'),
  referenceNote: z.string().max(500).optional(),
});

router.post('/record', async (req, res, next) => {
  try {
    const body = recordBody.parse(req.body);
    const payment = await recordPayment(body.bookingId, req.actor!, body);
    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// PAY-07 — PENDING -> SETTLED.
router.post('/:paymentId/settle', async (req, res, next) => {
  try {
    const { paymentId } = paymentIdParams.parse(req.params);
    const result = await settlePayment(paymentId, req.actor!);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PAY-08 — PENDING -> VOID, reason required.
router.post('/:paymentId/void', async (req, res, next) => {
  try {
    const { paymentId } = paymentIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const payment = await voidPayment(paymentId, reason, req.actor!);
    res.status(200).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// PAY-09 — a new direction:OUT payment with refundOf set, never a mutation
// of the original. Supports partial refunds.
const refundBody = z.strictObject({
  amount: z.number().positive(),
  reason: z.string().min(1).max(500),
  referenceNote: z.string().max(500).optional(),
});

router.post('/:paymentId/refund', async (req, res, next) => {
  try {
    const { paymentId } = paymentIdParams.parse(req.params);
    const body = refundBody.parse(req.body);
    const result = await refundPayment(paymentId, req.actor!, body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export { router as adminPaymentRoutes };
