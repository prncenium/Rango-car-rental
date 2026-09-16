import type { BookingStatus, CarListingState, CarModerationStatus } from '@rango/shared';
import { Badge } from '../ui/Badge';
import { bookingStatusMeta, carListingMeta, carModerationMeta } from '../../lib/statusMeta';

// Wraps Badge with lib/statusMeta.ts's mapping so every dashboard/detail
// view renders a given status the same way (docs/design/03-design-system.md
// §2.3/§8, spec 05 §6) — icon + text always together, one color family per
// real state, never an ad hoc one-off.
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta = bookingStatusMeta(status);
  return <Badge status={meta.badge}>{meta.label}</Badge>;
}

export function ModerationStatusBadge({ status }: { status: CarModerationStatus }) {
  const meta = carModerationMeta(status);
  return <Badge status={meta.badge}>{meta.label}</Badge>;
}

export function ListingStateBadge({ state }: { state: CarListingState }) {
  const meta = carListingMeta(state);
  return <Badge status={meta.badge}>{meta.label}</Badge>;
}
