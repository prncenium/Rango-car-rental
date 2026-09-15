import { Car, type CarDoc } from '../../models/Car.model.js';
import { Booking } from '../../models/Booking.model.js';
import { BookingDayLock } from '../../models/BookingDayLock.model.js';
import type { Guard } from './types.js';
import type { HydratedDocument } from 'mongoose';

type CarE = HydratedDocument<CarDoc>;

// listingState UNLISTED/DELISTED -> LISTED must not race ahead of moderation
// (D2: "publicly visible iff moderationStatus = APPROVED AND listingState =
// LISTED"). moderationStatus and listingState are independent fields, so
// nothing else enforces this ordering.
export const guardCarApproved: Guard<CarE> = {
  name: 'guardCarApproved',
  check: (entity) => {
    if (entity.moderationStatus !== 'APPROVED') {
      return { ok: false, details: { moderationStatus: entity.moderationStatus } };
    }
    return { ok: true };
  },
};

// Delisting a car that is currently holding a live rental (or a request under
// cancellation review — locks stay held there, spec 04 §1.3) would pull a car
// out from under an in-progress booking.
export const guardNoActiveDayLocks: Guard<CarE> = {
  name: 'guardNoActiveDayLocks',
  check: async (entity, _actor, session) => {
    const count = await BookingDayLock.countDocuments({ car: entity._id }).session(session);
    if (count > 0) {
      return { ok: false, details: { lockedDayCount: count } };
    }
    return { ok: true };
  },
};

// spec 02 E-10 — a listing can only be edited from DRAFT or REJECTED.
// APPROVED (whether LISTED or UNLISTED) must go back through withdraw first
// (E-12, not implemented in this pass), so a live listing's content can never
// change without an admin seeing the result again (D2's re-moderation intent).
export const guardEditableModerationState: Guard<CarE> = {
  name: 'guardEditableModerationState',
  check: (entity) => {
    if (entity.moderationStatus !== 'DRAFT' && entity.moderationStatus !== 'REJECTED') {
      return { ok: false, details: { moderationStatus: entity.moderationStatus, allowed: ['DRAFT', 'REJECTED'] } };
    }
    return { ok: true };
  },
};

// D3 — the partial unique index only reserves a plate for non-DRAFT cars, so
// a REJECTED car editing its registrationNumber onto an already-held plate
// would otherwise only be caught by a raw E11000 at save time. Checked
// explicitly here so the caller gets a named GUARD_FAILED instead.
export const guardRegistrationAvailable: Guard<CarE> = {
  name: 'guardRegistrationAvailable',
  check: async (entity, _actor, session) => {
    const conflict = await Car.findOne({
      _id: { $ne: entity._id },
      registrationNumber: entity.registrationNumber,
      moderationStatus: { $ne: 'DRAFT' },
    }).session(session);
    if (conflict) {
      return { ok: false, details: { field: 'registrationNumber' } };
    }
    return { ok: true };
  },
};

// spec 02 E-10 — a DRAFT/REJECTED car can still carry COMPLETED booking
// history; repricing must not silently rewrite what a live or pending
// rental owes.
export const guardNoLiveRentalOnPriceChange: Guard<CarE> = {
  name: 'guardNoLiveRentalOnPriceChange',
  check: async (entity, _actor, session) => {
    const count = await Booking.countDocuments({
      car: entity._id,
      status: { $in: ['CONFIRMED', 'ACTIVE', 'CANCELLATION_REQUESTED'] },
    }).session(session);
    if (count > 0) {
      return { ok: false, details: { bookingCount: count } };
    }
    return { ok: true };
  },
};

// spec 02 E-16 — the hard-delete exception is narrow on purpose: a listing no
// admin has ever seen. Three independent guards, all of which must hold.
export const guardNeverModerated: Guard<CarE> = {
  name: 'guardNeverModerated',
  check: (entity) => {
    if (entity.moderationStatus !== 'DRAFT' || entity.approvedAt) {
      return { ok: false, details: { moderationStatus: entity.moderationStatus, hint: 'Delist via /api/user/listings/:carId/delist' } };
    }
    return { ok: true };
  },
};

export const guardNeverPublished: Guard<CarE> = {
  name: 'guardNeverPublished',
  check: (entity) => {
    if (entity.publishedAt) {
      return { ok: false, details: { hint: 'Delist via /api/user/listings/:carId/delist' } };
    }
    return { ok: true };
  },
};

export const guardNoBookingsEver: Guard<CarE> = {
  name: 'guardNoBookingsEver',
  check: async (entity, _actor, session) => {
    const count = await Booking.countDocuments({ car: entity._id }).session(session);
    if (count > 0) {
      return { ok: false, details: { bookingCount: count, hint: 'Delist via /api/user/listings/:carId/delist' } };
    }
    return { ok: true };
  },
};
