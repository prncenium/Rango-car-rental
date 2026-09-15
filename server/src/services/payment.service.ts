import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
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

export interface AdminListPaymentsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  booking?: string | undefined;
  direction?: string | undefined;
  status?: string | undefined;
  purpose?: string | undefined;
}

const PAYMENTS_SORT: Record<string, 1 | -1> = { createdAt: -1 };

// ADM-05 — admin-only, filterable on booking/direction/status/purpose. No
// write path here: this block is read-only, per the task scope (record/
// settle/void/refund are PAY-FIX territory, not touched here).
export async function adminListPayments(query: AdminListPaymentsQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;

  const filter: FilterQuery<PaymentDoc> = {};
  if (query.booking) filter.booking = query.booking as unknown as PaymentDoc['booking'];
  if (query.direction) filter.direction = query.direction as PaymentDoc['direction'];
  if (query.status) filter.status = query.status as PaymentDoc['status'];
  if (query.purpose) filter.purpose = query.purpose as PaymentDoc['purpose'];

  const [data, total] = await Promise.all([
    Payment.find(filter)
      .sort({ ...PAYMENTS_SORT, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('recordedBy', 'name email')
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: 'createdAt:desc' },
  };
}
