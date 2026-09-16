import type { HydratedDocument } from 'mongoose';
import type { BookingDoc } from '../../models/Booking.model.js';
import { User } from '../../models/User.model.js';
import { Car } from '../../models/Car.model.js';
import { BookingDayLock } from '../../models/BookingDayLock.model.js';
import { toUtcMidnight } from '../../lib/dayLocks.js';
import type { Guard } from './types.js';

type BookingE = HydratedDocument<BookingDoc>;

// spec 04 §3.2 — the car's public-visibility predicate can change between a
// REQUESTED booking being created and an admin confirming it (edit sent it
// back to PENDING_APPROVAL, or it was delisted). Confirming must re-check
// D2's predicate at the moment of confirmation, not trust the state it was
// in when the request was made.
export const guardCarStillBookable: Guard<BookingE> = {
  name: 'guardCarStillBookable',
  check: async (entity, _actor, session) => {
    const car = await Car.findById(entity.car).session(session);
    if (!car || car.moderationStatus !== 'APPROVED' || car.listingState !== 'LISTED') {
      return { ok: false, details: { reason: 'CAR_NOT_BOOKABLE' } };
    }
    return { ok: true };
  },
};

// design §6 / spec 04 §3.3 — a car cannot be handed over before its own
// rental period has started.
export const guardStartDateReached: Guard<BookingE> = {
  name: 'guardStartDateReached',
  check: (entity) => {
    const today = toUtcMidnight(new Date());
    if (today.getTime() < toUtcMidnight(entity.startDate).getTime()) {
      return { ok: false, details: { startDate: entity.startDate } };
    }
    return { ok: true };
  },
};

// spec 04 §1.5 — the day-locks taken at confirm time must still all be in
// place at handover. Counts `source: BOOKING` rows only (never BUFFER): a
// buffer day legitimately converted to an ADMIN_BLOCK, or skipped by a
// best-effort re-insert, must not make a correct booking look tampered with.
export const guardLocksIntact: Guard<BookingE> = {
  name: 'guardLocksIntact',
  check: async (entity, _actor, session) => {
    const foundDays = await BookingDayLock.countDocuments({ booking: entity._id, source: 'BOOKING' }).session(
      session,
    );
    if (foundDays !== entity.days) {
      return { ok: false, details: { expectedDays: entity.days, foundDays } };
    }
    return { ok: true };
  },
};

// spec 04 §6.1's confirm-time guard: a request whose own startDate has
// already passed can never be confirmed (it just accumulates as "stale").
export const guardDatesNotPast: Guard<BookingE> = {
  name: 'guardDatesNotPast',
  check: (entity) => {
    const today = toUtcMidnight(new Date());
    if (toUtcMidnight(entity.startDate).getTime() < today.getTime()) {
      return { ok: false, details: { startDate: entity.startDate } };
    }
    return { ok: true };
  },
};

// D6 — a rental cannot be handed over unpaid. `overrideReason` on the entity
// (set by the service before calling transition(), from the request body) is
// the audited escape hatch; when present this guard is skipped by the caller
// choosing the ACTIVATED_UNPAID edge instead (see booking.service.ts).
export const guardPaymentCovered: Guard<BookingE> = {
  name: 'guardPaymentCovered',
  check: (entity) => {
    if (entity.amountReceived < entity.totalAmount) {
      return { ok: false, details: { required: entity.totalAmount, received: entity.amountReceived } };
    }
    return { ok: true };
  },
};

// spec 03 §4.6 / DEFECT-2 — the access token's `isActive` claim is a
// 15-minute-stale snapshot and is never a guard's authority. A renter
// deactivated between confirm and handover must not receive the car, so this
// re-reads User.isActive from the database, inside the same transaction as
// the CONFIRMED -> ACTIVE write, rather than trusting anything cached.
export const guardRenterActive: Guard<BookingE> = {
  name: 'guardRenterActive',
  check: async (entity, _actor, session) => {
    const renter = await User.findById(entity.renter).session(session);
    if (!renter || !renter.isActive) {
      return { ok: false, details: { reason: 'RENTER_INACTIVE' } };
    }
    return { ok: true };
  },
};

// D4/spec 04 §5.4 — a no-show can only be declared once the rental's own
// start date has actually passed; declaring it early would be indistinguishable
// from an ordinary confirmed-but-not-yet-started booking.
export const guardStartDatePassed: Guard<BookingE> = {
  name: 'guardStartDatePassed',
  check: (entity) => {
    const today = toUtcMidnight(new Date());
    if (today.getTime() <= toUtcMidnight(entity.startDate).getTime()) {
      return { ok: false, details: { startDate: entity.startDate } };
    }
    return { ok: true };
  },
};

// D4 — terminate's effectiveFrom is admin-chosen but bounded to
// [startDate, today]. The range [startDate, endDate) (the original design
// draft's range) strands every overdue booking permanently ACTIVE, since
// today >= endDate is precisely the overdue case. `entity.overrideReason` is
// reused here purely as a transient carrier for effectiveFrom, set by the
// service before calling transition() — never persisted under that name for
// this edge (see booking.service.ts terminateBooking()).
export const guardEffectiveFromValid: Guard<BookingE> = {
  name: 'guardEffectiveFromValid',
  check: (entity) => {
    const effectiveFrom = (entity as unknown as { $locals?: { effectiveFrom?: Date } }).$locals?.effectiveFrom;
    if (!effectiveFrom) {
      return { ok: false, details: { reason: 'effectiveFrom missing' } };
    }
    const today = toUtcMidnight(new Date());
    const start = toUtcMidnight(entity.startDate);
    if (effectiveFrom.getTime() < start.getTime() || effectiveFrom.getTime() > today.getTime()) {
      return {
        ok: false,
        details: { effectiveFrom: effectiveFrom.toISOString().slice(0, 10), allowedFrom: entity.startDate, allowedTo: today },
      };
    }
    return { ok: true };
  },
};
