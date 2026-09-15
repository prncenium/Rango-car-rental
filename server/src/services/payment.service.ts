import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import type { PaymentMethod, PaymentPurpose } from '@rango/shared';
import type { ActorContext } from '../lib/actor.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Booking, type BookingDoc } from '../models/Booking.model.js';
import { Payment, type PaymentDoc } from '../models/Payment.model.js';
import { AuditLog } from '../models/AuditLog.model.js';

const AMOUNT_FIELD: Record<PaymentPurpose, 'amountReceived' | 'depositReceived'> = {
  RENTAL: 'amountReceived',
  DEPOSIT: 'depositReceived',
};

async function loadBookingOrThrow(bookingId: string, session: ClientSession) {
  const booking = await Booking.findById(bookingId).session(session);
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }
  return booking;
}

// D6/D7 — "confirm offline payment" is the one-click admin action for a cash
// business: the admin is asserting cash arrived, so the Payment is created
// already SETTLED, and the booking's denormalised total is updated in the
// same transaction, by this service and nothing else (spec 04 §3.3, TR-B3).
export async function confirmOfflinePayment(
  bookingId: string,
  actor: ActorContext,
  params: { amount: number; paymentMethod: PaymentMethod; purpose: PaymentPurpose; referenceNote?: string | undefined },
) {
  if (!(params.amount > 0)) {
    throw new ValidationError('Payment amount must be greater than zero.', {
      source: 'body',
      fieldErrors: { amount: ['must be greater than zero'] },
    });
  }
  if (params.purpose !== 'RENTAL' && params.purpose !== 'DEPOSIT') {
    throw new ValidationError('Invalid payment purpose.', {
      source: 'body',
      fieldErrors: { purpose: ['must be RENTAL or DEPOSIT'] },
    });
  }

  const session = await mongoose.startSession();
  try {
    let result!: { payment: HydratedDocument<PaymentDoc>; booking: HydratedDocument<BookingDoc> };
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      if (booking.status === 'CANCELLED' || booking.status === 'REJECTED' || booking.status === 'COMPLETED') {
        throw new ValidationError('This booking is no longer expecting payment.', {
          source: 'body',
          fieldErrors: { bookingId: [`booking is ${booking.status}`] },
        });
      }

      const [payment] = await Payment.create(
        [
          {
            booking: booking._id,
            amount: params.amount,
            paymentMethod: params.paymentMethod,
            direction: 'IN',
            purpose: params.purpose,
            status: 'SETTLED',
            recordedBy: actor.userId,
            settledAt: new Date(),
            referenceNote: params.referenceNote,
          },
        ],
        { session },
      );
      if (!payment) {
        throw new Error('Payment.create returned no document.');
      }

      const field = AMOUNT_FIELD[params.purpose];
      booking.set(field, (booking.get(field) as number) + params.amount);
      await booking.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'PAYMENT_SETTLED',
            entityType: 'PAYMENT',
            entityId: payment._id,
            previousState: undefined,
            newState: 'SETTLED',
            reason: params.referenceNote,
            metadata: { bookingId: booking._id, purpose: params.purpose, amount: params.amount },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      result = { payment, booking };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
