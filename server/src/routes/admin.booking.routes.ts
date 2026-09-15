import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, PAYMENT_METHODS, PAYMENT_PURPOSES } from '@rango/shared';
import {
  activateBooking,
  cancelBooking,
  completeBooking,
  confirmBooking,
  markNoShow,
  rejectBooking,
} from '../services/booking.service.js';
import { confirmOfflinePayment } from '../services/payment.service.js';

const router = Router();

const bookingIdParams = z.object({ bookingId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });

router.post('/:bookingId/confirm', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const booking = await confirmBooking(bookingId, req.actor!);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

router.post('/:bookingId/reject', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const booking = await rejectBooking(bookingId, reason, req.actor!);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

router.post('/:bookingId/cancel', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const booking = await cancelBooking(bookingId, reason, req.actor!);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

// D6 — the offline cash confirmation. Not a status transition on Payment's
// own PENDING->SETTLED edge (there is no separate "record" step here); the
// admin is asserting cash arrived and settled in the same click.
const confirmPaymentBody = z.strictObject({
  amount: z.number().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  purpose: z.enum(PAYMENT_PURPOSES).default('RENTAL'),
  referenceNote: z.string().max(500).optional(),
});

router.post('/:bookingId/confirm-offline-payment', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const body = confirmPaymentBody.parse(req.body);
    const result = await confirmOfflinePayment(bookingId, req.actor!, body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

const activateBody = z.strictObject({
  odometerOut: z.number().int().nonnegative().optional(),
  overrideReason: z.string().min(1).max(500).optional(),
});

router.post('/:bookingId/mark-active', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const body = activateBody.parse(req.body);
    const booking = await activateBooking(bookingId, req.actor!, body);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

const completeBody = z.strictObject({
  odometerIn: z.number().int().nonnegative().optional(),
  conditionNote: z.string().max(1000).optional(),
});

router.post('/:bookingId/mark-returned', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const body = completeBody.parse(req.body);
    const booking = await completeBooking(bookingId, req.actor!, body);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

const noShowBody = z.strictObject({ reason: z.string().min(1).max(500).optional() });

router.post('/:bookingId/no-show', async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParams.parse(req.params);
    const { reason } = noShowBody.parse(req.body);
    const booking = await markNoShow(bookingId, reason, req.actor!);
    res.status(200).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

export { router as adminBookingRoutes };
