import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
import type { PaymentMethod, PaymentPurpose } from '@rango/shared';
import type { ActorContext } from '../lib/actor.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Booking, type BookingDoc } from '../models/Booking.model.js';
import { Payment, type PaymentDoc } from '../models/Payment.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { transition, transitionWithEdge } from '../transitions/transition.js';
import { paymentRefundEdge, paymentRegistry } from '../transitions/registry.js';

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

      // Created PENDING, then routed through the same registry edge
      // settlePayment() uses (task item 6) — the "one-click" shortcut is one
      // extra transition() call in the same transaction, not a hand-rolled
      // status write.
      const [payment] = await Payment.create(
        [
          {
            booking: booking._id,
            amount: params.amount,
            paymentMethod: params.paymentMethod,
            direction: 'IN',
            purpose: params.purpose,
            status: 'PENDING',
            recordedBy: actor.userId,
            referenceNote: params.referenceNote,
          },
        ],
        { session },
      );
      if (!payment) {
        throw new Error('Payment.create returned no document.');
      }

      await transition({
        registry: paymentRegistry,
        entityType: 'PAYMENT',
        field: 'status',
        entity: payment,
        to: 'SETTLED',
        actor,
        session,
        reason: params.referenceNote,
        metadata: { bookingId: booking._id, purpose: params.purpose, amount: params.amount },
      });

      const field = AMOUNT_FIELD[params.purpose];
      booking.set(field, (booking.get(field) as number) + params.amount);
      await booking.save({ session });

      result = { payment, booking };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function loadPaymentOrThrow(paymentId: string, session: ClientSession) {
  const payment = await Payment.findById(paymentId).session(session);
  if (!payment) {
    throw new NotFoundError('Payment not found.');
  }
  return payment;
}

function assertBookingExpectsPayment(booking: HydratedDocument<BookingDoc>) {
  if (booking.status === 'CANCELLED' || booking.status === 'REJECTED' || booking.status === 'COMPLETED') {
    throw new ValidationError('This booking is no longer expecting payment.', {
      source: 'body',
      fieldErrors: { bookingId: [`booking is ${booking.status}`] },
    });
  }
}

// PAY-06 — logs a payment as expected before cash actually arrives, kept
// separate from confirmOfflinePayment (the one-click PENDING+SETTLED
// shortcut above). Booking.amountReceived/depositReceived is untouched until
// settlePayment() below.
export async function recordPayment(
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

  const session = await mongoose.startSession();
  try {
    let result!: HydratedDocument<PaymentDoc>;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      assertBookingExpectsPayment(booking);

      const [payment] = await Payment.create(
        [
          {
            booking: booking._id,
            amount: params.amount,
            paymentMethod: params.paymentMethod,
            direction: 'IN',
            purpose: params.purpose,
            status: 'PENDING',
            recordedBy: actor.userId,
            referenceNote: params.referenceNote,
          },
        ],
        { session },
      );
      if (!payment) {
        throw new Error('Payment.create returned no document.');
      }

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'PAYMENT_RECORDED',
            entityType: 'PAYMENT',
            entityId: payment._id,
            newState: 'PENDING',
            reason: params.referenceNote,
            metadata: { bookingId: booking._id, purpose: params.purpose, amount: params.amount },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      result = payment;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// PAY-07 — PENDING -> SETTLED, updating the booking's amount field for the
// payment's purpose in the same transaction (D6), by exactly one writer
// (TR-B3). Routed through transition()/paymentRegistry (task item 6): a
// PENDING check is no longer hand-rolled here — an already-SETTLED or -VOID
// payment simply has no such edge, and transition() step 1 rejects it with
// 409 INVALID_TRANSITION, which is the correct code for a replayed edge
// (spec 02 §3.2), not 400 VALIDATION_FAILED.
export async function settlePayment(paymentId: string, actor: ActorContext) {
  const session = await mongoose.startSession();
  try {
    let result!: { payment: HydratedDocument<PaymentDoc>; booking: HydratedDocument<BookingDoc> };
    await session.withTransaction(async () => {
      const payment = await loadPaymentOrThrow(paymentId, session);
      if (payment.direction !== 'IN') {
        throw new ValidationError('Only an inbound (IN) payment can be settled.', {
          source: 'body',
          fieldErrors: { paymentId: ['payment direction is OUT'] },
        });
      }

      const booking = await loadBookingOrThrow(String(payment.booking), session);

      await transition({
        registry: paymentRegistry,
        entityType: 'PAYMENT',
        field: 'status',
        entity: payment,
        to: 'SETTLED',
        actor,
        session,
        metadata: { bookingId: booking._id, purpose: payment.purpose, amount: payment.amount },
      });

      const field = AMOUNT_FIELD[payment.purpose];
      booking.set(field, (booking.get(field) as number) + payment.amount);
      await booking.save({ session });

      result = { payment, booking };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// PAY-08 — PENDING -> VOID, closing the dead end a permanently-pending
// payment would otherwise be. A SETTLED payment is never voided (it already
// contributed to the booking's amount field — the correction there is a
// refund, not a void).
export async function voidPayment(paymentId: string, reason: string, actor: ActorContext) {
  if (!reason || !reason.trim()) {
    throw new ValidationError('A reason is required to void a payment.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required to void a payment'] },
    });
  }

  const session = await mongoose.startSession();
  try {
    let result!: HydratedDocument<PaymentDoc>;
    await session.withTransaction(async () => {
      const payment = await loadPaymentOrThrow(paymentId, session);
      // voidReason is a persisted field, not just audit metadata, so it is
      // set before transition() runs (same pattern as Booking's
      // rejectionReason/cancellationReason ahead of their own transition()
      // calls) — transition()'s sideEffects only knows (entity, actor).
      payment.voidReason = reason;

      result = await transition({
        registry: paymentRegistry,
        entityType: 'PAYMENT',
        field: 'status',
        entity: payment,
        to: 'VOID',
        actor,
        session,
        reason,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// PAY-09 — a refund is a NEW direction:OUT payment with refundOf pointing at
// the original, never a mutation of the original IN record (D7). Created
// already SETTLED — the admin is asserting cash was handed back at this
// moment, same one-click-assertion pattern as confirmOfflinePayment.
export async function refundPayment(
  originalPaymentId: string,
  actor: ActorContext,
  params: { amount: number; reason: string; referenceNote?: string | undefined },
) {
  if (!(params.amount > 0)) {
    throw new ValidationError('Refund amount must be greater than zero.', {
      source: 'body',
      fieldErrors: { amount: ['must be greater than zero'] },
    });
  }
  if (!params.reason || !params.reason.trim()) {
    throw new ValidationError('A reason is required to refund a payment.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required to refund a payment'] },
    });
  }

  const session = await mongoose.startSession();
  try {
    let result!: { payment: HydratedDocument<PaymentDoc>; booking: HydratedDocument<BookingDoc> };
    await session.withTransaction(async () => {
      const original = await loadPaymentOrThrow(originalPaymentId, session);
      if (original.direction !== 'IN' || original.status !== 'SETTLED') {
        throw new ValidationError('Only a SETTLED inbound payment can be refunded.', {
          source: 'body',
          fieldErrors: { paymentId: ['original payment must be a SETTLED IN payment'] },
        });
      }

      const priorRefunds = await Payment.find({ refundOf: original._id, direction: 'OUT', status: 'SETTLED' })
        .session(session)
        .lean();
      const alreadyRefunded = priorRefunds.reduce((sum, p) => sum + p.amount, 0);
      const available = original.amount - alreadyRefunded;
      if (params.amount > available) {
        throw new ValidationError('Refund amount exceeds the amount still available on the original payment.', {
          source: 'body',
          fieldErrors: { amount: [`exceeds available amount ${available}`] },
        });
      }

      const booking = await loadBookingOrThrow(String(original.booking), session);

      // Created PENDING, then routed through paymentRefundEdge —
      // transitionWithEdge() (not transition()) because this shares its
      // (from, to) pair with the ordinary settle edge above and needs its
      // own auditAction (PAYMENT_REFUNDED, not PAYMENT_SETTLED) so the audit
      // trail can tell "cash in" from "cash out" apart (task item 6).
      const [refund] = await Payment.create(
        [
          {
            booking: original.booking,
            amount: params.amount,
            paymentMethod: original.paymentMethod,
            direction: 'OUT',
            purpose: original.purpose,
            status: 'PENDING',
            refundOf: original._id,
            recordedBy: actor.userId,
            referenceNote: params.referenceNote,
          },
        ],
        { session },
      );
      if (!refund) {
        throw new Error('Payment.create returned no document.');
      }

      await transitionWithEdge({
        edge: paymentRefundEdge,
        entityType: 'PAYMENT',
        field: 'status',
        entity: refund,
        actor,
        session,
        reason: params.reason,
        metadata: {
          bookingId: booking._id,
          purpose: original.purpose,
          amount: params.amount,
          refundOf: String(original._id),
        },
      });

      const field = AMOUNT_FIELD[original.purpose];
      booking.set(field, (booking.get(field) as number) - params.amount);
      await booking.save({ session });

      result = { payment: refund, booking };
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
