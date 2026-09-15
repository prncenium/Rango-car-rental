import type { CarDoc } from '../../models/Car.model.js';
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
