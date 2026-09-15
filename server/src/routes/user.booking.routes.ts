import { Router } from 'express';
import { z } from 'zod';
import { BOOKING_STATUSES, objectIdSchema } from '@rango/shared';
import { cancelOwnBookingRequest, listOwnBookings, requestBooking } from '../services/booking.service.js';

const router = Router();

const bookingIdParams = z.object({ bookingId: objectIdSchema });
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// spec 02 E-17 / exception E4 — renter/owner/totalAmount/amountReceived/status
// are absent from this DTO entirely (D10): none of them is even a key here.
const requestBookingBody = z.strictObject({
  carId: objectIdSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema,
});

// spec 02 E-18 — reason is optional here (unlike E-19's request-cancellation,
// which requires one); withdrawing your own open request needs no
// justification to anyone.
const cancelBody = z.strictObject({
  reason: z.string().min(1).max(500).optional(),
});

const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt:desc', 'startDate:asc', 'startDate:desc']).optional(),
  role: z.enum(['RENTER', 'OWNER']).optional(),
  status: z
    .union([z.enum(BOOKING_STATUSES), z.array(z.enum(BOOKING_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  startDateFrom: dateStringSchema.optional(),
  startDateTo: dateStringSchema.optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = requestBookingBody.parse(req.body);
    const booking = await requestBooking(req.actor!, body);
    res.status(201).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await listOwnBookings(req.actor!, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:bookingId/cancel', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const { reason } = cancelBody.parse(req.body);
    const booking = await cancelOwnBookingRequest(bookingId, req.actor!, reason);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

export { router as userBookingRoutes };
