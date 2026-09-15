import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Booking, type BookingDoc } from '../models/Booking.model.js';
import { insertBookingLocks, releaseBookingLocks } from '../lib/dayLocks.js';
import { transition, transitionWithEdge } from '../transitions/transition.js';
import { bookingRegistry, bookingActivateUnpaidEdge } from '../transitions/registry.js';

type BookingE = HydratedDocument<BookingDoc>;

function requireReason(reason: string | undefined, action: string): string {
  if (!reason || !reason.trim()) {
    throw new ValidationError(`A reason is required to ${action}.`, {
      source: 'body',
      fieldErrors: { reason: [`reason is required to ${action}`] },
    });
  }
  return reason;
}

async function loadBookingOrThrow(bookingId: string, session: ClientSession): Promise<BookingE> {
  const booking = await Booking.findById(bookingId).session(session);
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }
  return booking;
}

// BOOK-03 — confirm acquires every day-lock for the range inside the same
// transaction as the status write (design §6). A duplicate-key abort
// surfaces as ConflictError before the status write ever happens.
export async function confirmBooking(bookingId: string, actor: ActorContext): Promise<BookingE> {
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      await insertBookingLocks(session, {
        car: booking.car,
        booking: booking._id,
        startDate: booking.startDate,
        endDate: booking.endDate,
        createdBy: actor.userId,
      });
      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'CONFIRMED',
        actor,
        session,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function rejectBooking(bookingId: string, reason: string, actor: ActorContext): Promise<BookingE> {
  requireReason(reason, 'reject a booking request');
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      booking.rejectionReason = reason;
      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'REJECTED',
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

// Admin cancel — covers REQUESTED, CONFIRMED, and CANCELLATION_REQUESTED all
// collapsing to CANCELLED (D4's admin-resolution outcome), releasing every
// day-lock the booking held.
export async function cancelBooking(bookingId: string, reason: string, actor: ActorContext): Promise<BookingE> {
  requireReason(reason, 'cancel a booking');
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      booking.cancellationReason = reason;
      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'CANCELLED',
        actor,
        session,
        reason,
      });
      await releaseBookingLocks(session, booking._id);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// D6 — activation requires settled payment covering the full quote, or an
// explicit, audited override. The two are distinct registry edges
// (BOOKING_STARTED vs BOOKING_ACTIVATED_UNPAID) so the override is never
// silently indistinguishable from an ordinary paid handover in the audit log.
export async function activateBooking(
  bookingId: string,
  actor: ActorContext,
  params: { odometerOut?: number | undefined; overrideReason?: string | undefined },
): Promise<BookingE> {
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      if (typeof params.odometerOut === 'number') {
        booking.odometerOut = params.odometerOut;
      }

      if (params.overrideReason) {
        booking.overrideReason = params.overrideReason;
        result = await transitionWithEdge({
          edge: bookingActivateUnpaidEdge,
          entityType: 'BOOKING',
          field: 'status',
          entity: booking,
          actor,
          session,
          reason: params.overrideReason,
        });
      } else {
        result = await transition({
          registry: bookingRegistry,
          entityType: 'BOOKING',
          field: 'status',
          entity: booking,
          to: 'ACTIVE',
          actor,
          session,
        });
      }
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// "mark-returned" — ACTIVE -> COMPLETED, releasing every remaining lock.
export async function completeBooking(
  bookingId: string,
  actor: ActorContext,
  params: { odometerIn?: number | undefined; conditionNote?: string | undefined },
): Promise<BookingE> {
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      if (typeof params.odometerIn === 'number') {
        booking.odometerIn = params.odometerIn;
      }
      if (params.conditionNote) {
        booking.conditionNote = params.conditionNote;
      }
      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'COMPLETED',
        actor,
        session,
      });
      await releaseBookingLocks(session, booking._id);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// D4/spec 04 §5.4 — CONFIRMED -> NO_SHOW, admin only, requires today > startDate.
export async function markNoShow(bookingId: string, reason: string | undefined, actor: ActorContext): Promise<BookingE> {
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      if (reason) {
        booking.noShowReason = reason;
      }
      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'NO_SHOW',
        actor,
        session,
        reason,
      });
      await releaseBookingLocks(session, booking._id);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
