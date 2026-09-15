import type { HydratedDocument } from 'mongoose';
import type { BookingDoc } from '../../models/Booking.model.js';
import { toUtcMidnight } from '../../lib/dayLocks.js';
import type { Guard } from './types.js';

type BookingE = HydratedDocument<BookingDoc>;

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
