import type { HydratedDocument } from 'mongoose';
import type { CarDoc } from '../models/Car.model.js';
import type { BookingDoc } from '../models/Booking.model.js';
import { guardCarApproved, guardNoActiveDayLocks } from './guards/car.guards.js';
import { guardDatesNotPast, guardPaymentCovered, guardStartDatePassed } from './guards/booking.guards.js';
import type { TransitionEdge, TransitionRegistry } from './transition.js';
import { registryKey } from './transition.js';

type CarE = HydratedDocument<CarDoc>;
type BookingE = HydratedDocument<BookingDoc>;

const carRegistry: TransitionRegistry<CarE> = new Map();

carRegistry.set(registryKey('CAR', 'moderationStatus'), [
  {
    from: 'PENDING_APPROVAL',
    to: 'APPROVED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'CAR_APPROVED',
    sideEffects: (_e, actor) => ({ approvedBy: actor.userId, approvedAt: new Date(), rejectionReason: undefined }),
  },
  {
    from: 'PENDING_APPROVAL',
    to: 'REJECTED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'CAR_REJECTED',
    sideEffects: (_e, actor) => ({ rejectedBy: actor.userId, rejectedAt: new Date() }),
  },
]);

carRegistry.set(registryKey('CAR', 'listingState'), [
  {
    // D2/C-3 — publish is admin-only; the car must already be APPROVED.
    from: 'UNLISTED',
    to: 'LISTED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardCarApproved],
    auditAction: 'CAR_PUBLISHED',
    sideEffects: () => ({ publishedAt: new Date() }),
  },
  {
    from: 'LISTED',
    to: 'DELISTED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardNoActiveDayLocks],
    auditAction: 'CAR_DELISTED',
    sideEffects: (_e, actor) => ({ delistedBy: actor.userId, delistedAt: new Date() }),
  },
  {
    // C-3 — relist (DELISTED -> LISTED) is admin-only, corrected from an
    // earlier design draft that put it under /api/user against INV-1.
    from: 'DELISTED',
    to: 'LISTED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardCarApproved],
    auditAction: 'CAR_PUBLISHED',
    sideEffects: () => ({
      publishedAt: new Date(),
      delistedBy: undefined,
      delistedAt: undefined,
      delistedReason: undefined,
    }),
  },
]);

const bookingRegistry: TransitionRegistry<BookingE> = new Map();

bookingRegistry.set(registryKey('BOOKING', 'status'), [
  {
    from: 'REQUESTED',
    to: 'CONFIRMED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardDatesNotPast],
    auditAction: 'BOOKING_CONFIRMED',
    sideEffects: (_e, actor) => ({ confirmedBy: actor.userId, confirmedAt: new Date() }),
  },
  {
    from: 'REQUESTED',
    to: 'REJECTED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'BOOKING_REJECTED',
    sideEffects: (_e, actor) => ({ rejectedBy: actor.userId, rejectedAt: new Date() }),
  },
  {
    // Covers both an admin cancelling an open request and resolving a
    // cancellation request to CANCELLED (D4) — locks are released by the
    // caller after this transition commits (booking.service.ts).
    from: 'REQUESTED',
    to: 'CANCELLED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'BOOKING_CANCELLED',
    sideEffects: (_e, actor) => ({ cancelledBy: actor.userId, cancelledAt: new Date() }),
  },
  {
    from: 'CONFIRMED',
    to: 'CANCELLED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'BOOKING_CANCELLED',
    sideEffects: (_e, actor) => ({ cancelledBy: actor.userId, cancelledAt: new Date() }),
  },
  {
    from: 'CANCELLATION_REQUESTED',
    to: 'CANCELLED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'BOOKING_CANCELLED',
    sideEffects: (_e, actor) => ({ cancelledBy: actor.userId, cancelledAt: new Date() }),
  },
  {
    // D6 — the paid path. The unpaid-override path is a distinct edge below
    // so the two are separately auditable (BOOKING_STARTED vs
    // BOOKING_ACTIVATED_UNPAID) rather than one edge with a conditional audit action.
    from: 'CONFIRMED',
    to: 'ACTIVE',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardPaymentCovered],
    auditAction: 'BOOKING_STARTED',
    sideEffects: () => ({ handedOverAt: new Date() }),
  },
  {
    from: 'ACTIVE',
    to: 'COMPLETED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'BOOKING_COMPLETED',
    sideEffects: () => ({ returnedAt: new Date() }),
  },
  {
    // D4/Δ-B8 — a renter who never shows up. Releasing locks is the caller's
    // job after commit (booking.service.ts), exactly as for CANCELLED.
    from: 'CONFIRMED',
    to: 'NO_SHOW',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardStartDatePassed],
    auditAction: 'BOOKING_NO_SHOW',
    sideEffects: (_e, actor) => ({ noShowAt: new Date(), noShowBy: actor.userId, noShowCleared: false }),
  },
]);

// The unpaid-override edge shares (from, to) with the paid edge above, which
// findEdge() can't disambiguate on (entityType, field, from, to) alone — so
// the service layer picks the edge explicitly rather than through the
// registry when `overrideReason` is present. See booking.service.ts activate().
export const bookingActivateUnpaidEdge: TransitionEdge<BookingE> = {
  from: 'CONFIRMED',
  to: 'ACTIVE',
  actorClasses: ['ADMIN', 'SUPER_ADMIN'],
  guards: [],
  auditAction: 'BOOKING_ACTIVATED_UNPAID',
  sideEffects: () => ({ handedOverAt: new Date() }),
};

export { carRegistry, bookingRegistry };
