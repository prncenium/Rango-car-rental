import type { BookingStatus, CarListingState, CarModerationStatus } from '@rango/shared';
import type { BadgeStatus } from '../components/ui/Badge';

// The single join point between the domain state machines and the UI —
// docs/design/03-design-system.md §2.3/§8 and spec 05 §6: "this table gets a
// new row before any component renders that state, never an inline one-off
// color." Every dashboard/status view in /account renders through these
// functions rather than switching on a status string itself.

export interface StatusMeta {
  badge: BadgeStatus;
  label: string;
  explain: string;
}

// spec 05 §6.3 + §7 rule 1 — RULE AV-2: a REQUESTED booking must say, in
// words, that it is not yet a booking, on every surface that renders it.
export function bookingStatusMeta(status: BookingStatus): StatusMeta {
  switch (status) {
    case 'REQUESTED':
      return {
        badge: 'pending',
        label: 'Requested',
        explain: "This is a request, not a confirmed booking — an admin still needs to review it.",
      };
    case 'CONFIRMED':
      return {
        badge: 'success',
        label: 'Confirmed',
        explain: 'Your booking is confirmed. Meet the owner in person on your start date to pick up the car and pay.',
      };
    case 'REJECTED':
      return { badge: 'danger', label: 'Rejected', explain: 'This request was declined.' };
    case 'ACTIVE':
      return { badge: 'success', label: 'In progress', explain: 'The car has been handed over.' };
    case 'CANCELLATION_REQUESTED':
      return {
        badge: 'warning',
        label: 'Cancellation requested',
        explain: 'A cancellation request is pending admin review. The booking stays confirmed and the car stays held until then.',
      };
    case 'COMPLETED':
      return { badge: 'success', label: 'Completed', explain: 'This rental is finished.' };
    case 'TERMINATED':
      return { badge: 'danger', label: 'Ended early', explain: 'An admin ended this rental early.' };
    case 'CANCELLED':
      return { badge: 'danger', label: 'Cancelled', explain: 'This booking was cancelled.' };
    case 'NO_SHOW':
      return { badge: 'danger', label: 'No-show', explain: 'Marked as a no-show by an admin.' };
    default:
      return { badge: 'neutral', label: status, explain: '' };
  }
}

export function carModerationMeta(status: CarModerationStatus): StatusMeta {
  switch (status) {
    case 'DRAFT':
      return { badge: 'neutral', label: 'Draft', explain: 'Not submitted for review yet.' };
    case 'PENDING_APPROVAL':
      return {
        badge: 'pending',
        label: 'Under review',
        explain: "An admin is reviewing this listing. You'll see it here once it's approved or if it needs changes.",
      };
    case 'APPROVED':
      return { badge: 'success', label: 'Approved', explain: 'Approved by an admin.' };
    case 'REJECTED':
      return { badge: 'danger', label: 'Changes needed', explain: 'An admin asked for changes.' };
    default:
      return { badge: 'neutral', label: status, explain: '' };
  }
}

export function carListingMeta(state: CarListingState): StatusMeta {
  switch (state) {
    case 'UNLISTED':
      return { badge: 'inactive', label: 'Not listed', explain: 'Not visible to renters yet.' };
    case 'LISTED':
      return { badge: 'success', label: 'Listed', explain: 'Visible to renters and bookable now.' };
    case 'DELISTED':
      return { badge: 'inactive', label: 'Delisted', explain: 'No longer visible to renters.' };
    default:
      return { badge: 'neutral', label: state, explain: '' };
  }
}

// spec 04 §1.4's "stale" flag is derivable client-side from data the renter
// already has (startDate vs. today) — unlike dateConflict/competingRequestCount,
// which need visibility into other renters' bookings and are not returned by
// GET /api/user/bookings, so they are not rendered anywhere in this pass.
export function isStaleRequest(status: BookingStatus, startDateIso: string, todayIso: string): boolean {
  return status === 'REQUESTED' && startDateIso < todayIso;
}
