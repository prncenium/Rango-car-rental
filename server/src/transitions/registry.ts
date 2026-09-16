import type { HydratedDocument } from 'mongoose';
import type { CarDoc } from '../models/Car.model.js';
import type { BookingDoc } from '../models/Booking.model.js';
import type { PaymentDoc } from '../models/Payment.model.js';
import { guardCarApproved, guardNoActiveDayLocks, guardNotListed, guardRegistrationAvailable } from './guards/car.guards.js';
import {
  guardCarStillBookable,
  guardDatesNotPast,
  guardEffectiveFromValid,
  guardLocksIntact,
  guardPaymentCovered,
  guardRenterActive,
  guardStartDatePassed,
  guardStartDateReached,
} from './guards/booking.guards.js';
import { guardNotOverpaying } from './guards/payment.guards.js';
import type { TransitionEdge, TransitionRegistry } from './transition.js';
import { registryKey } from './transition.js';

type CarE = HydratedDocument<CarDoc>;
type BookingE = HydratedDocument<BookingDoc>;
type PaymentE = HydratedDocument<PaymentDoc>;

const carRegistry: TransitionRegistry<CarE> = new Map();

carRegistry.set(registryKey('CAR', 'moderationStatus'), [
  {
    // CAR-08 / spec 02 E-11 (exception E1) — the owner's own submission for
    // review. guardRegistrationAvailable is the D3 plate-collision check:
    // the partial unique index doesn't cover DRAFT, so this is the first
    // moment a plate collision with another submitted listing is caught.
    from: 'DRAFT',
    to: 'PENDING_APPROVAL',
    actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN'],
    guards: [guardRegistrationAvailable],
    auditAction: 'CAR_SUBMITTED',
  },
  {
    // spec 02 §2.2 — resubmission after rejection re-runs the same plate
    // check, since the content (and possibly the plate) may have changed.
    from: 'REJECTED',
    to: 'PENDING_APPROVAL',
    actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN'],
    guards: [guardRegistrationAvailable],
    auditAction: 'CAR_SUBMITTED',
  },
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
  {
    // spec 02 E-12 (exception E2) — pull an unapproved listing back out of
    // the review queue.
    from: 'PENDING_APPROVAL',
    to: 'DRAFT',
    actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'CAR_WITHDRAWN',
  },
  {
    // spec 02 E-12 — closes the INV-4 dead end: an APPROVED-but-UNLISTED car
    // otherwise has no outgoing edge at all (see E-10's re-moderation note).
    // guardNotListed stops a currently-LISTED car from going straight to
    // DRAFT (delist first, E-13); guardNoActiveDayLocks stops a car with a
    // live or future-confirmed rental from being withdrawn out from under it
    // (CAR-08) — both must hold even though ordinary delist already clears
    // day-locks, because a *forced* admin delist (E-32) can leave an
    // APPROVED+UNLISTED car still holding active locks.
    from: 'APPROVED',
    to: 'DRAFT',
    actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN'],
    guards: [guardNotListed, guardNoActiveDayLocks],
    auditAction: 'CAR_WITHDRAWN',
    sideEffects: () => ({ approvedBy: undefined, approvedAt: undefined }),
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
    // Shared by admin delist (E-32, unforced) and owner delist (E-13,
    // exception E3, CAR-08) — both use the same non-overridable
    // guardNoActiveDayLocks. E-32's `force: true` override path is a
    // separate edge selected via transitionWithEdge() when it's added; it is
    // not part of this pass.
    from: 'LISTED',
    to: 'DELISTED',
    actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN'],
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
    // guardCarStillBookable / guardRenterActive re-check, at confirmation
    // time, the two facts that can have changed since the request was made:
    // the car's public-visibility predicate (D2) and the renter's account
    // state (spec 03 §4.6 — the token is never the authority).
    guards: [guardDatesNotPast, guardCarStillBookable, guardRenterActive],
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
    // Covers an admin cancelling an open request, resolving a cancellation
    // request to CANCELLED (D4), and spec 02 E-18/exception E5 — a renter
    // withdrawing their own still-open request. The USER-role case is only
    // reachable once booking.service.ts's cancelOwnBookingRequest() has
    // already confirmed the caller *is* the renter (never the car owner) —
    // widening actorClasses here does not, by itself, admit anyone else.
    // Locks are released by the caller after this transition commits
    // (booking.service.ts) — none exist yet for a REQUESTED booking anyway.
    from: 'REQUESTED',
    to: 'CANCELLED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN', 'USER'],
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
    // guardStartDateReached — a car cannot be handed over before its own
    // rental period begins. guardLocksIntact — the day-locks taken at
    // confirm time must still all be present at handover (spec 04 §1.5).
    guards: [guardPaymentCovered, guardRenterActive, guardStartDateReached, guardLocksIntact],
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
    // D4 — admin ends a live rental early. reason is required (enforced in
    // booking.service.ts, same pattern as reject/cancel); effectiveFrom is
    // bounded to [startDate, today] by guardEffectiveFromValid and drives
    // which day-locks the caller releases after this transition commits.
    from: 'ACTIVE',
    to: 'TERMINATED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardEffectiveFromValid],
    auditAction: 'BOOKING_TERMINATED',
    sideEffects: () => ({ terminatedAt: new Date() }),
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
  // The payment guard is what this edge overrides — none of the others are
  // payment guards and all stay in force on the override path too, per spec
  // 03 §4.6: the token is never the authority, and no override reason is a
  // substitute for "this account can still legally take the car" or "the
  // rental period has actually started with its locks intact."
  guards: [guardRenterActive, guardStartDateReached, guardLocksIntact],
  auditAction: 'BOOKING_ACTIVATED_UNPAID',
  sideEffects: () => ({ handedOverAt: new Date() }),
};

// D6/D7 — every payment status write (settle, void, and the SETTLED half of
// confirm-offline-payment / refund, both of which create a fresh document in
// PENDING and immediately transition it) goes through this registry rather
// than a hand-rolled `payment.status = ...; payment.save()` in the service
// layer, exactly like Car and Booking (spec 04 §6, task item 6).
const paymentRegistry: TransitionRegistry<PaymentE> = new Map();

paymentRegistry.set(registryKey('PAYMENT', 'status'), [
  {
    from: 'PENDING',
    to: 'SETTLED',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [guardNotOverpaying],
    auditAction: 'PAYMENT_SETTLED',
    sideEffects: () => ({ settledAt: new Date() }),
  },
  {
    from: 'PENDING',
    to: 'VOID',
    actorClasses: ['ADMIN', 'SUPER_ADMIN'],
    guards: [],
    auditAction: 'PAYMENT_VOIDED',
    sideEffects: () => ({ voidedAt: new Date() }),
  },
]);

// PAY-09/D7 — a refund shares (PENDING -> SETTLED) with the ordinary settle
// edge above but must log as PAYMENT_REFUNDED, not PAYMENT_SETTLED, so the
// audit trail distinguishes "cash came in" from "cash went back out." Not
// disambiguable via findEdge() alone (same pattern as
// bookingActivateUnpaidEdge above) — the service layer selects this edge
// explicitly via transitionWithEdge() rather than transition().
export const paymentRefundEdge: TransitionEdge<PaymentE> = {
  from: 'PENDING',
  to: 'SETTLED',
  actorClasses: ['ADMIN', 'SUPER_ADMIN'],
  guards: [guardNotOverpaying],
  auditAction: 'PAYMENT_REFUNDED',
  sideEffects: () => ({ settledAt: new Date() }),
};

export { carRegistry, bookingRegistry, paymentRegistry };
