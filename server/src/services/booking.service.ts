import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { isAdminActor } from '../lib/actor.js';
import { ForbiddenTransitionError, GuardFailedError, InvalidTransitionError, NotFoundError, ValidationError } from '../lib/errors.js';
import { Booking, type BookingDoc } from '../models/Booking.model.js';
import { Car } from '../models/Car.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { insertBookingLocks, releaseBookingLocks } from '../lib/dayLocks.js';
import { toUtcMidnight } from '../lib/dayLocks.js';
import { getBookingConfig } from '../lib/systemConfig.js';
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

export interface RequestBookingInput {
  carId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// spec 02 E-17 / exception E4 — a creation, not an edge: there is no prior
// Booking to run through transition(), only the server-forced initial state
// (D10 — renter/owner/totalAmount are never taken from the body). No
// day-locks are taken here (D5: locks exist only from CONFIRMED onward).
//
// Guard set implements spec 04 §3.1's D8 replacement for the deleted
// guardRenterKycVerified (there is no KYC entity — D8 is void in full):
// guardCarPubliclyBookable, guardNotOwnRental, guardDateRangeValid,
// guardNoExistingRequestForRange, guardOpenRequestCap, guardNoUnresolvedNoShow,
// guardNoOverdueRental. guardNoOverlappingRentalAnyCar (spec 04 §3.1's most
// expensive precondition, cross-car) is deliberately deferred out of this pass.
export async function requestBooking(actor: ActorContext, input: RequestBookingInput): Promise<BookingE> {
  const startDate = toUtcMidnight(new Date(input.startDate));
  const endDate = toUtcMidnight(new Date(input.endDate));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ValidationError('startDate and endDate must be valid YYYY-MM-DD dates.', {
      source: 'body',
      fieldErrors: { startDate: ['invalid date'], endDate: ['invalid date'] },
    });
  }

  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const car = await Car.findById(input.carId).session(session);
      // Not publicly bookable and non-existent are the same 404 to this
      // caller (spec 02 E-07's identical-404 principle applied to booking).
      if (!car || car.moderationStatus !== 'APPROVED' || car.listingState !== 'LISTED') {
        throw new NotFoundError('Car not found.');
      }
      if (String(car.owner) === String(actor.userId)) {
        throw new GuardFailedError('You cannot rent your own car.', { guard: 'guardNotOwnRental' });
      }

      const config = await getBookingConfig(session);
      const today = toUtcMidnight(new Date());
      const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);

      if (days < 1) {
        throw new GuardFailedError('endDate must be after startDate.', {
          guard: 'guardDateRangeValid',
          rule: 'END_AFTER_START',
        });
      }
      if (startDate.getTime() < today.getTime()) {
        throw new GuardFailedError('startDate cannot be in the past.', {
          guard: 'guardDateRangeValid',
          rule: 'START_NOT_PAST',
          startDate: input.startDate,
        });
      }
      if (days > config.maxDurationDays) {
        throw new GuardFailedError(`Bookings cannot exceed ${config.maxDurationDays} days.`, {
          guard: 'guardDateRangeValid',
          rule: 'MAX_DURATION',
          maxDurationDays: config.maxDurationDays,
        });
      }
      const maxAdvanceDate = new Date(today.getTime() + config.maxAdvanceDays * 86_400_000);
      if (startDate.getTime() > maxAdvanceDate.getTime()) {
        throw new GuardFailedError('startDate is too far in the future.', {
          guard: 'guardDateRangeValid',
          rule: 'MAX_ADVANCE',
          maxAdvanceDays: config.maxAdvanceDays,
        });
      }

      const overlappingOwnRequest = await Booking.exists({
        car: car._id,
        renter: actor.userId,
        status: { $in: ['REQUESTED', 'CONFIRMED'] },
        startDate: { $lt: endDate },
        endDate: { $gt: startDate },
      }).session(session);
      if (overlappingOwnRequest) {
        throw new GuardFailedError('You already have a request or booking covering these dates.', {
          guard: 'guardNoExistingRequestForRange',
          bookingId: overlappingOwnRequest._id,
        });
      }

      const openRequestCount = await Booking.countDocuments({ renter: actor.userId, status: 'REQUESTED' }).session(
        session,
      );
      if (openRequestCount >= config.maxOpenRequestsPerUser) {
        throw new GuardFailedError('You have too many open booking requests.', {
          guard: 'guardOpenRequestCap',
          limit: config.maxOpenRequestsPerUser,
        });
      }

      const hasUnresolvedNoShow = await Booking.exists({
        renter: actor.userId,
        status: 'NO_SHOW',
        noShowCleared: false,
      }).session(session);
      if (hasUnresolvedNoShow) {
        throw new GuardFailedError('An unresolved no-show is blocking new requests.', {
          guard: 'guardNoUnresolvedNoShow',
        });
      }

      const hasOverdueRental = await Booking.exists({
        renter: actor.userId,
        status: 'ACTIVE',
        endDate: { $lt: today },
      }).session(session);
      if (hasOverdueRental) {
        throw new GuardFailedError('An overdue rental is blocking new requests.', {
          guard: 'guardNoOverdueRental',
        });
      }

      const ratePerDaySnapshot = car.rentalPricePerDay;
      const depositSnapshot = car.depositAmount ?? 0;
      // spec 02 E-17's simple quote (ratePerDaySnapshot × days). Spec 04
      // §2.2's blended weekly-rate min() calculation is not applied here —
      // deferred along with the rest of the pricing engine.
      const totalAmount = ratePerDaySnapshot * days;

      const created = await Booking.create(
        [
          {
            car: car._id,
            renter: actor.userId,
            owner: car.owner,
            startDate,
            endDate,
            days,
            ratePerDaySnapshot,
            ...(car.rentalPricePerWeek !== undefined ? { weeklyRateSnapshot: car.rentalPricePerWeek } : {}),
            depositSnapshot,
            quotedTotalAmount: totalAmount,
            totalAmount,
            status: 'REQUESTED',
          },
        ],
        { session },
      );
      const booking = created[0]!;

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'BOOKING_REQUESTED',
            entityType: 'BOOKING',
            entityId: booking._id,
            newState: 'REQUESTED',
            metadata: { carId: String(car._id), startDate: input.startDate, endDate: input.endDate, totalAmount },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      result = booking;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 02 E-18 / exception E5 — the renter withdrawing their own still-open
// request. Ownership is checked here, before transition() is ever reached,
// so the exact spec error codes apply: a party the caller cannot see at all
// is 404 (§3.4 rule 2); the car's *owner* calling this — a real party to the
// booking, but the wrong one for this edge — is 403 FORBIDDEN_TRANSITION,
// not a guard failure. Only REQUESTED->CANCELLED via the actor's own renter
// identity ever reaches the registry edge.
export async function cancelOwnBookingRequest(
  bookingId: string,
  actor: ActorContext,
  reason: string | undefined,
): Promise<BookingE> {
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      const isRenter = String(booking.renter) === String(actor.userId);
      const isOwner = String(booking.owner) === String(actor.userId);
      const isAdmin = isAdminActor(actor);

      if (!isRenter && !isOwner && !isAdmin) {
        throw new NotFoundError('Booking not found.');
      }
      if (!isRenter && !isAdmin) {
        throw new ForbiddenTransitionError('Only the renter may cancel their own request.', {
          entityType: 'BOOKING',
          field: 'status',
          from: booking.status,
          to: 'CANCELLED',
        });
      }
      // This endpoint applies only to REQUESTED (spec 02 E-18) — a CONFIRMED
      // booking must go through request-cancellation (E-19, not implemented
      // in this pass). Checked explicitly rather than left to transition()'s
      // dispatch, because the registry's CONFIRMED->CANCELLED edge exists for
      // the *admin* cancel path and would otherwise surface as a role
      // mismatch (403) instead of the spec's intended "no such edge" (409).
      if (isRenter && !isAdmin && booking.status !== 'REQUESTED') {
        throw new InvalidTransitionError(`No such transition: BOOKING.status ${booking.status} -> CANCELLED.`, {
          entityType: 'BOOKING',
          field: 'status',
          from: booking.status,
          to: 'CANCELLED',
        });
      }

      if (reason) {
        booking.cancellationReason = reason;
      }
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
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export interface ListOwnBookingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  role?: 'RENTER' | 'OWNER' | undefined;
  status?: string[] | undefined;
  startDateFrom?: string | undefined;
  startDateTo?: string | undefined;
}

const BOOKINGS_SORT_WHITELIST: Record<string, Record<string, 1 | -1>> = {
  'createdAt:desc': { createdAt: -1 },
  'startDate:asc': { startDate: 1 },
  'startDate:desc': { startDate: -1 },
};

// spec 02 E-20 — scopeToActor('renter'|'owner') per `role`, mandatory per
// TR-05. Any USER may both list and rent, so both views are legitimate.
export async function listOwnBookings(actor: ActorContext, query: ListOwnBookingsQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;
  const sortKey = query.sort && BOOKINGS_SORT_WHITELIST[query.sort] ? query.sort : 'createdAt:desc';
  const scopeField = query.role === 'OWNER' ? 'owner' : 'renter';

  const filter: FilterQuery<BookingDoc> = { [scopeField]: actor.userId };
  if (query.status?.length) {
    filter.status = { $in: query.status as BookingDoc['status'][] };
  }
  if (query.startDateFrom || query.startDateTo) {
    filter.startDate = {};
    if (query.startDateFrom) filter.startDate.$gte = new Date(query.startDateFrom);
    if (query.startDateTo) filter.startDate.$lt = new Date(query.startDateTo);
  }

  const [data, total] = await Promise.all([
    Booking.find(filter)
      .sort({ ...BOOKINGS_SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}
