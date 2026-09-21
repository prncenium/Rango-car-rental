import { Router } from 'express';
import { z } from 'zod';
import { BOOKING_STATUSES, objectIdSchema } from '@rango/shared';
import { cancelOwnBookingRequest, getRentalAgreementPdf, listOwnBookings, requestBooking } from '../services/booking.service.js';

const router = Router();

const bookingIdParams = z.object({ bookingId: objectIdSchema });
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// spec 02 E-17 / exception E4 — renter/owner/totalAmount/amountReceived/status
// are absent from this DTO entirely (D10): none of them is even a key here.
const requestBookingBody = z.strictObject({
  carId: objectIdSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  // Digital "I agree to the Terms & Conditions" checkbox — required, must
  // be exactly true (omitting it or sending false is a 400, not a silent
  // false). Separate from the physical signature captured on the rental
  // agreement PDF at godown handover.
  agreedToTerms: z
    .boolean()
    .refine((v) => v === true, { message: 'You must agree to the Terms & Conditions to request a booking.' }),
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

// scopeToActor is enforced inside getRentalAgreementPdf itself (a foreign
// booking is 404, never 403 — spec 02 §3.4 rule 2), same as every other
// /api/user route in this file.
router.get('/:bookingId/agreement', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const pdfBytes = await getRentalAgreementPdf(bookingId, req.actor!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rental-agreement-${bookingId}.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

export { router as userBookingRoutes };
