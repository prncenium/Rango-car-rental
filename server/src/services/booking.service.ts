import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
import { DAILY_DISTANCE_CAP_KM } from '@rango/shared';
import type { ActorContext } from '../lib/actor.js';
import { isAdminActor } from '../lib/actor.js';
import { ForbiddenTransitionError, GuardFailedError, InvalidTransitionError, NotFoundError, ValidationError } from '../lib/errors.js';
import { Booking, type BookingDoc } from '../models/Booking.model.js';
import { Car } from '../models/Car.model.js';
import { Payment } from '../models/Payment.model.js';
import { BookingDayLock } from '../models/BookingDayLock.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { insertBookingLocks, releaseBookingLocks, releaseBookingLocksFrom } from '../lib/dayLocks.js';
import { toUtcMidnight } from '../lib/dayLocks.js';
import { getBookingConfig } from '../lib/systemConfig.js';
import { transition, transitionWithEdge } from '../transitions/transition.js';
import { bookingRegistry, bookingActivateUnpaidEdge } from '../transitions/registry.js';
import { generateRentalAgreementPdf } from '../lib/rentalAgreement.js';

// Available as soon as a request is made (all the fields it needs — renter
// profile, car, dates, deposit — already exist at REQUESTED, and the
// customer acknowledgement/checkbox is captured at that same moment) through
// every status the booking can still reach afterward. Only a booking that
// never had agreed dates in the first place (REJECTED, CANCELLED-from-REQUESTED)
// has nothing to put in a document.
const AGREEMENT_ELIGIBLE_STATUSES: BookingDoc['status'][] = [
  'REQUESTED',
  'CONFIRMED',
  'CANCELLATION_REQUESTED',
  'ACTIVE',
  'COMPLETED',
  'TERMINATED',
  'NO_SHOW',
];

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

      // spec 04 §2.2a — distance driven beyond `days * DAILY_DISTANCE_CAP_KM`
      // is billed at the car's extraKmRatePerKm, snapshotted here (mirrors
      // ratePerDaySnapshot's request-time snapshot pattern) and added to
      // totalAmount. Only computed when both odometer readings exist.
      if (typeof booking.odometerOut === 'number' && typeof booking.odometerIn === 'number') {
        const car = await Car.findById(booking.car).session(session);
        const rate = car?.extraKmRatePerKm ?? 0;
        const distanceDriven = Math.max(0, booking.odometerIn - booking.odometerOut);
        const allowedKm = booking.days * DAILY_DISTANCE_CAP_KM;
        const excessKm = Math.max(0, distanceDriven - allowedKm);
        booking.excessKm = excessKm;
        booking.excessKmRateSnapshot = rate;
        booking.excessKmChargeAmount = excessKm * rate;
        booking.totalAmount += booking.excessKmChargeAmount;
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

// D4 — admin ends a live rental early. `effectiveFrom` defaults to today
// (UTC midnight) and is bounded to [startDate, today] by
// guardEffectiveFromValid; a range ending at endDate would strand every
// overdue booking (today >= endDate is exactly the overdue case). Only the
// days from effectiveFrom forward are released — days already consumed stay
// locked/historical (spec 04 §1.3, §3.3).
export async function terminateBooking(
  bookingId: string,
  actor: ActorContext,
  params: { reason: string; effectiveFrom?: string | undefined },
): Promise<BookingE> {
  requireReason(params.reason, 'terminate a rental early');
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      const effectiveFrom = params.effectiveFrom ? toUtcMidnight(new Date(params.effectiveFrom)) : toUtcMidnight(new Date());
      if (Number.isNaN(effectiveFrom.getTime())) {
        throw new ValidationError('effectiveFrom must be a valid YYYY-MM-DD date.', {
          source: 'body',
          fieldErrors: { effectiveFrom: ['invalid date'] },
        });
      }

      booking.terminationReason = params.reason;
      // guardEffectiveFromValid reads this off $locals — a transient,
      // never-persisted per-document bag Mongoose provides for exactly this
      // (passing extra context to a guard without inventing a schema field
      // or a body-supplied status/date the actor could otherwise smuggle in).
      booking.$locals.effectiveFrom = effectiveFrom;

      result = await transition({
        registry: bookingRegistry,
        entityType: 'BOOKING',
        field: 'status',
        entity: booking,
        to: 'TERMINATED',
        actor,
        session,
        reason: params.reason,
        metadata: { effectiveFrom: effectiveFrom.toISOString().slice(0, 10) },
      });
      await releaseBookingLocksFrom(session, booking._id, effectiveFrom);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// BOOK-12 — lifts a no-show flag. This does NOT change Booking.status: the
// gap is that noShowCleared (set false by markNoShow) had no transition that
// ever set it true, making a single admin's no-show call a permanent,
// unappealable ban (spec 04 D4). Not a status transition, so it does not go
// through transition() — same pattern as confirmOfflinePayment's direct
// write + explicit AuditLog row for a non-status admin action.
export async function clearNoShow(bookingId: string, reason: string, actor: ActorContext): Promise<BookingE> {
  requireReason(reason, 'clear a no-show');
  const session = await mongoose.startSession();
  try {
    let result!: BookingE;
    await session.withTransaction(async () => {
      const booking = await loadBookingOrThrow(bookingId, session);
      if (booking.noShowCleared) {
        throw new ValidationError('This no-show has already been cleared.', {
          source: 'body',
          fieldErrors: { bookingId: ['no-show already cleared'] },
        });
      }
      if (!booking.noShowAt) {
        throw new ValidationError('This booking has no no-show to clear.', {
          source: 'body',
          fieldErrors: { bookingId: ['booking was never marked no-show'] },
        });
      }

      booking.noShowCleared = true;
      booking.noShowClearedBy = actor.userId;
      booking.noShowClearedAt = new Date();
      booking.noShowClearedReason = reason;
      await booking.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'BOOKING_NO_SHOW_CLEARED',
            entityType: 'BOOKING',
            entityId: booking._id,
            reason,
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

export interface RequestBookingInput {
  carId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  agreedToTerms: boolean; // guaranteed true by the route's zod refine before this is ever called
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
// guardNoOverdueRental, guardNoOverlappingRentalAnyCar.
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

      // guardNoOverlappingRentalAnyCar — a renter cannot hold two cars' worth
      // of CONFIRMED/ACTIVE days at once (spec 04 §8 trade-offs). Unlike
      // guardNoExistingRequestForRange above (same car), this checks across
      // every car the renter has committed to; REQUESTED never counts here
      // because it holds no locks and binds nothing (RULE AV-1).
      const overlappingAnyCar = await Booking.exists({
        renter: actor.userId,
        status: { $in: ['CONFIRMED', 'ACTIVE'] },
        startDate: { $lt: endDate },
        endDate: { $gt: startDate },
      }).session(session);
      if (overlappingAnyCar) {
        throw new GuardFailedError('You already hold a confirmed or active rental during these dates.', {
          guard: 'guardNoOverlappingRentalAnyCar',
          bookingId: overlappingAnyCar._id,
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
            termsAcceptedAt: new Date(),
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

// ADM-04 — admin has no ownership scope: any booking is readable. "Stale" has
// no SystemConfig field of its own (D12 doesn't name one), so a fixed
// threshold is used here, same pattern as the DEFAULT_* fallbacks in
// lib/systemConfig.ts.
const STALE_REQUEST_DAYS = 3;

export interface AdminListBookingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  status?: string[] | undefined;
  car?: string | undefined;
  renter?: string | undefined;
  owner?: string | undefined;
  startDateFrom?: string | undefined;
  startDateTo?: string | undefined;
  unpaidOnly?: boolean | undefined;
  overdueOnly?: boolean | undefined;
  staleOnly?: boolean | undefined;
  conflictedOnly?: boolean | undefined;
}

export async function adminListBookings(query: AdminListBookingsQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;
  const sortKey = query.sort && BOOKINGS_SORT_WHITELIST[query.sort] ? query.sort : 'createdAt:desc';
  const today = toUtcMidnight(new Date());

  const filter: FilterQuery<BookingDoc> = {};
  if (query.status?.length) {
    filter.status = { $in: query.status as BookingDoc['status'][] };
  }
  if (query.car) filter.car = query.car as unknown as BookingDoc['car'];
  if (query.renter) filter.renter = query.renter as unknown as BookingDoc['renter'];
  if (query.owner) filter.owner = query.owner as unknown as BookingDoc['owner'];
  if (query.startDateFrom || query.startDateTo) {
    filter.startDate = {};
    if (query.startDateFrom) filter.startDate.$gte = new Date(query.startDateFrom);
    if (query.startDateTo) filter.startDate.$lt = new Date(query.startDateTo);
  }
  if (query.unpaidOnly) {
    filter.status = 'CONFIRMED';
    filter.$expr = { $lt: ['$amountReceived', '$totalAmount'] };
  }
  if (query.overdueOnly) {
    filter.status = 'ACTIVE';
    filter.endDate = { $lt: today };
  }
  if (query.staleOnly) {
    filter.status = 'REQUESTED';
    filter.createdAt = { $lt: new Date(today.getTime() - STALE_REQUEST_DAYS * 86_400_000) };
  }

  if (query.conflictedOnly) {
    // A REQUESTED booking is "conflicted" when another non-terminal booking
    // on the same car overlaps its dates (spec 01 §1.4's queuing model: more
    // than one REQUESTED/CONFIRMED booking can exist for the same days,
    // admin picks one to confirm and must reject/cancel the rest).
    const candidates = await Booking.find({ status: 'REQUESTED' }).select('_id car startDate endDate').lean();
    const conflictedIds: string[] = [];
    for (const candidate of candidates) {
      const overlap = await Booking.exists({
        _id: { $ne: candidate._id },
        car: candidate.car,
        status: { $in: ['REQUESTED', 'CONFIRMED', 'ACTIVE', 'CANCELLATION_REQUESTED'] },
        startDate: { $lt: candidate.endDate },
        endDate: { $gt: candidate.startDate },
      });
      if (overlap) conflictedIds.push(String(candidate._id));
    }
    filter._id = { $in: conflictedIds } as unknown as FilterQuery<BookingDoc>['_id'];
  }

  const [data, total] = await Promise.all([
    Booking.find(filter)
      .sort({ ...BOOKINGS_SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('renter', 'name email phone')
      .populate('owner', 'name email phone')
      .populate('car', 'make model registrationNumber')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}

// ADM-04 — AdminBookingDetail: both parties in full, payments[], and a
// day-lock summary. No ownership scope — any booking is readable by an admin.
export async function adminGetBookingDetail(bookingId: string) {
  const booking = await Booking.findById(bookingId)
    .populate('renter', 'name email phone drivingLicence')
    .populate('owner', 'name email phone')
    .populate('car', 'make model registrationNumber location extraKmRatePerKm')
    .lean();
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }

  const [payments, dayLocks] = await Promise.all([
    Payment.find({ booking: booking._id }).sort({ createdAt: 1 }).lean(),
    BookingDayLock.find({ booking: booking._id }).sort({ day: 1 }).select('day source').lean(),
  ]);

  return {
    ...booking,
    payments,
    dayLocks: {
      count: dayLocks.length,
      from: dayLocks[0]?.day ?? null,
      to: dayLocks[dayLocks.length - 1]?.day ?? null,
    },
  };
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

  // spec 02 §7.2 — BookingSummary carries `car: PublicCarSummary` but
  // deliberately "no counterparty at all, in any state" (renter/owner are
  // never populated here, on purpose — that's what keeps a list endpoint
  // from being usable to harvest contacts in bulk; PartyContact only ever
  // appears on the single-record BookingDetail read, E-21).
  const [data, total] = await Promise.all([
    Booking.find(filter)
      .sort({ ...BOOKINGS_SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('car', 'make model year color transmission fuelType seats mileageKm images location rentalPricePerDay')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}

// Renter side: scoped to the caller's own booking, 404 (never 403) if it
// belongs to someone else, per spec 02 §3.4 rule 2. Admin side: any booking.
// PDF is generated fresh on every call — see rentalAgreement.ts's own note
// on why nothing is cached or persisted.
export async function getRentalAgreementPdf(bookingId: string, actor: ActorContext): Promise<Uint8Array> {
  const booking = await Booking.findById(bookingId)
    .populate('renter', 'name phone drivingLicence')
    .populate('car', 'make model year registrationNumber')
    .lean();

  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }

  const isAdmin = isAdminActor(actor);
  const renter = booking.renter as unknown as { _id: mongoose.Types.ObjectId; name: string; phone: string; drivingLicence: { number: string } };
  const car = booking.car as unknown as { make: string; model: string; year: number; registrationNumber: string };

  if (!isAdmin && String(renter._id) !== String(actor.userId)) {
    throw new NotFoundError('Booking not found.');
  }

  if (!AGREEMENT_ELIGIBLE_STATUSES.includes(booking.status)) {
    throw new GuardFailedError('This booking has not been confirmed yet — there is nothing to put in a rental agreement.', {
      guard: 'guardBookingConfirmedForAgreement',
    });
  }

  return generateRentalAgreementPdf({
    bookingId: String(booking._id),
    customerName: renter.name,
    mobileNumber: renter.phone,
    drivingLicenceNumber: renter.drivingLicence.number,
    vehicleRegistrationNumber: car.registrationNumber,
    vehicleDescription: `${car.make} ${car.model} ${car.year}`,
    rentalStartDate: booking.startDate.toISOString().slice(0, 10),
    rentalReturnDate: booking.endDate.toISOString().slice(0, 10),
    securityDeposit: booking.depositSnapshot,
  });
}
