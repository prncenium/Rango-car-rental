import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, PAYMENT_DIRECTIONS, PAYMENT_PURPOSES, PAYMENT_STATUSES } from '@rango/shared';
import { adminListPayments } from '../services/payment.service.js';

const router = Router();

// ADM-05 — payment list only (record/settle/void/refund are out of this
// pass's scope; confirm-offline-payment already exists under
// /api/admin/bookings/:bookingId/confirm-offline-payment).
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

export { router as adminPaymentRoutes };
