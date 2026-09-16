import type {
  BookingStatus,
  CarFuelType,
  CarListingState,
  CarModerationStatus,
  CarTransmission,
  PaymentMethod,
  PaymentPurpose,
} from '@rango/shared';
import { apiFetch, apiFetchWithMeta } from '../lib/apiClient';
import type { ListMeta } from './bookings';

// GET /api/admin/dashboard/counts (E-62) — matches
// server/src/services/adminQueue.service.ts's getDashboardCounts() exactly.
// Field names here are the real, shipped response shape, not spec 05.5
// §1.2's proposed key names (e.g. `queues.listingsPendingApproval`) — those
// differ from what the server actually returns and this file follows the code.
export interface DashboardCounts {
  queues: {
    listingsPending: number;
    bookingsRequested: number;
    bookingsAwaitingPayment: number;
    bookingsAwaitingHandover: number;
  };
  operations: {
    returnsOverdue: number;
  };
  cancellationRequestsOpen: number;
}

export function getDashboardCounts(): Promise<DashboardCounts> {
  return apiFetch<DashboardCounts>('/admin/dashboard/counts');
}

// AdminCar — GET /api/admin/listings / GET /api/admin/listings/:carId
// (ADM-03). Unlike OwnCar (client/src/api/listings.ts), `owner` is populated
// (name/email/phone) and there is no ownership scoping — an admin can see
// every moderation×listing combination, including DRAFT (spec 02 §7.2's
// AdminCar shape, minus the fields — approvedBy/rejectedBy/delistedBy,
// activeBookingId, lockedDayCount — this server response actually carries).
export interface AdminCarOwner {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface AdminCar {
  id: string;
  owner: AdminCarOwner;
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  color?: string;
  transmission: CarTransmission;
  fuelType: CarFuelType;
  seats: number;
  mileageKm: number;
  images: string[];
  description?: string;
  location: { city: string; state: string };
  rentalPricePerDay: number;
  rentalPricePerWeek?: number;
  depositAmount?: number;
  moderationStatus: CarModerationStatus;
  listingState: CarListingState;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  publishedAt?: string;
  delistedAt?: string;
  delistedReason?: string;
  createdAt: string;
  updatedAt: string;
  // Present only on the single-record read (adminGetListing).
  activeBookingId?: string | null;
  lockedDayCount?: number;
}

export interface AdminListListingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: 'createdAt:desc' | 'updatedAt:desc' | 'rentalPricePerDay:asc' | 'rentalPricePerDay:desc' | undefined;
  moderationStatus?: CarModerationStatus[] | undefined;
  listingState?: CarListingState[] | undefined;
  owner?: string | undefined;
  city?: string | undefined;
}

function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function adminListListings(query: AdminListListingsQuery = {}): Promise<{ data: AdminCar[]; meta: ListMeta }> {
  return apiFetchWithMeta<AdminCar[], ListMeta>(`/admin/listings${buildQueryString(query as Record<string, unknown>)}`);
}

export function adminGetListing(carId: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}`);
}

// POST /api/admin/listings/:carId/approve — no body accepted server-side
// (server/src/routes/admin.car.routes.ts parses no schema for this route).
// spec 05.5 §0.4 RULE ADM-1 still requires the confirm modal + non-empty
// note in the UI; there is simply nowhere on the server for that text to
// land yet, so nothing is sent.
export function approveListing(carId: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}/approve`, { method: 'POST', body: {} });
}

// POST /api/admin/listings/:carId/reject — reason is server-required
// (reasonBody: { reason: string, 1..500 }).
export function rejectListing(carId: string, reason: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}/reject`, { method: 'POST', body: { reason } });
}

// POST /api/admin/listings/:carId/publish — moderationStatus APPROVED
// required (guardModerationApproved server-side); no body.
export function publishListing(carId: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}/publish`, { method: 'POST', body: {} });
}

// POST /api/admin/listings/:carId/delist — reason is server-required.
export function delistListing(carId: string, reason: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}/delist`, { method: 'POST', body: { reason } });
}

// POST /api/admin/listings/:carId/relist — no body.
export function relistListing(carId: string): Promise<AdminCar> {
  return apiFetch<AdminCar>(`/admin/listings/${carId}/relist`, { method: 'POST', body: {} });
}

// GET /api/admin/audit (ADM-01) — used by the Dashboard's "today's
// activity" feed (spec 05.5 §1.3), pre-scoped to today client-side via
// createdAtFrom.
export interface AuditLogEntry {
  id: string;
  actor: { id: string; name: string; email: string; role: string } | string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  createdAt: string;
}

export interface AdminAuditQuery {
  entityType?: string | undefined;
  action?: string | undefined;
  createdAtFrom?: string | undefined;
  createdAtTo?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export function getAuditLog(query: AdminAuditQuery = {}): Promise<{ data: AuditLogEntry[]; meta: ListMeta }> {
  return apiFetchWithMeta<AuditLogEntry[], ListMeta>(`/admin/audit${buildQueryString(query as Record<string, unknown>)}`);
}

// ---------------------------------------------------------------------------
// Bookings (ADM-04, server/src/routes/admin.booking.routes.ts)
//
// adminListBookings/adminGetBooking read straight off `.lean()` Mongoose
// queries in server/src/services/booking.service.ts with no `_id`->`id`
// mapping layer (unlike the public car endpoints' explicit `toPublicCarSummary`
// mapping) — so, unlike `AdminCar` above, these shapes carry Mongo's `_id`
// verbatim. Populated `car`/`renter`/`owner` sub-documents do too.
// ---------------------------------------------------------------------------

export interface AdminBookingParty {
  _id: string;
  name: string;
  email: string;
  phone: string;
  // Only present on GET /admin/bookings/:bookingId's populated renter (spec
  // 04 §7.2 — the admin handover screen reads the on-file licence number off
  // this exact field). Not present on the queue list's populate select.
  drivingLicence?: { number: string };
}

export interface AdminBookingCarSummary {
  _id: string;
  make: string;
  model: string;
  registrationNumber: string;
  location?: { city: string; state: string };
}

export interface AdminBookingListItem {
  _id: string;
  car: AdminBookingCarSummary;
  renter: AdminBookingParty;
  owner: AdminBookingParty;
  startDate: string;
  endDate: string;
  days: number;
  ratePerDaySnapshot: number;
  totalAmount: number;
  amountReceived: number;
  depositSnapshot: number;
  depositReceived: number;
  status: BookingStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  terminationReason?: string;
  noShowReason?: string;
  noShowCleared: boolean;
  createdAt: string;
}

export interface AdminPaymentRecord {
  _id: string;
  booking: string;
  amount: number;
  paymentMethod: PaymentMethod;
  direction: 'IN' | 'OUT';
  purpose: PaymentPurpose;
  status: 'PENDING' | 'SETTLED' | 'VOID';
  referenceNote?: string;
  createdAt: string;
}

export interface AdminBookingDetail extends AdminBookingListItem {
  odometerOut?: number;
  odometerIn?: number;
  handedOverAt?: string;
  returnedAt?: string;
  overrideReason?: string;
  payments: AdminPaymentRecord[];
  dayLocks: { count: number; from: string | null; to: string | null };
}

export interface AdminListBookingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: 'createdAt:desc' | 'startDate:asc' | 'startDate:desc' | undefined;
  status?: BookingStatus[] | undefined;
  startDateFrom?: string | undefined;
  startDateTo?: string | undefined;
  unpaidOnly?: boolean | undefined;
  overdueOnly?: boolean | undefined;
  staleOnly?: boolean | undefined;
  conflictedOnly?: boolean | undefined;
}

export function adminListBookings(
  query: AdminListBookingsQuery = {},
): Promise<{ data: AdminBookingListItem[]; meta: ListMeta }> {
  return apiFetchWithMeta<AdminBookingListItem[], ListMeta>(
    `/admin/bookings${buildQueryString(query as Record<string, unknown>)}`,
  );
}

export function adminGetBooking(bookingId: string): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}`);
}

// POST /api/admin/bookings/:bookingId/confirm — no body accepted server-side
// (spec 05.5 §3.2: this is also the instant contact reveals to both parties —
// not a separate action, a derived consequence of the status write).
export function confirmBooking(bookingId: string): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/confirm`, { method: 'POST', body: {} });
}

// POST /api/admin/bookings/:bookingId/reject — reason is server-required.
export function rejectBooking(bookingId: string, reason: string): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/reject`, { method: 'POST', body: { reason } });
}

// POST /api/admin/bookings/:bookingId/cancel — reason is server-required.
// Guard `guardStatusCancellable` restricts this to REQUESTED/CONFIRMED; an
// ACTIVE booking's only exit on this server is /terminate (not wired in this
// pass — spec 05.5 §3.6 names it as a completeness case, out of this
// session's literal scope).
export function cancelBooking(bookingId: string, reason: string): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason } });
}

// POST /api/admin/bookings/:bookingId/no-show — reason is server-optional,
// UI-required per RULE ADM-1 (ConfirmReasonModal enforces non-empty text
// regardless of `reasonRequired`).
export function markNoShow(bookingId: string, reason: string): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/no-show`, { method: 'POST', body: { reason } });
}

export interface ConfirmOfflinePaymentInput {
  amount: number;
  paymentMethod: PaymentMethod;
  purpose: PaymentPurpose;
  referenceNote?: string | undefined;
}

// POST /api/admin/bookings/:bookingId/confirm-offline-payment — the one-click
// PENDING+SETTLED cash shortcut (server/src/services/payment.service.ts's
// confirmOfflinePayment). Deliberately NOT optimistic in the calling page
// (spec 05.5 §3.2: "a double-submitted cash entry inflates amountReceived
// and can let an unpaid car out").
export function confirmOfflinePayment(
  bookingId: string,
  input: ConfirmOfflinePaymentInput,
): Promise<{ payment: AdminPaymentRecord; booking: AdminBookingDetail }> {
  return apiFetch<{ payment: AdminPaymentRecord; booking: AdminBookingDetail }>(
    `/admin/bookings/${bookingId}/confirm-offline-payment`,
    { method: 'POST', body: input },
  );
}

export interface MarkBookingActiveInput {
  odometerOut?: number | undefined;
  overrideReason?: string | undefined;
}

// POST /api/admin/bookings/:bookingId/mark-active — CONFIRMED -> ACTIVE
// ("handover"). The server accepts only `odometerOut`/`overrideReason` —
// spec 05.5 §3.3's full identity-check attestation
// (identityCheckPassed/licenceNumberSeen/notes) has no field on Booking's
// schema or this route yet (server/src/models/Booking.model.ts does define
// `identityCheck`, but nothing writes it outside the schema itself). This
// pass's handover form collects the on-file licence number for the admin to
// visually compare (per spec 04 §7 — a physical, human check) but cannot
// submit it anywhere; flagged rather than silently dropped.
export function markBookingActive(bookingId: string, input: MarkBookingActiveInput): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/mark-active`, { method: 'POST', body: input });
}

export interface MarkBookingReturnedInput {
  odometerIn?: number | undefined;
  conditionNote?: string | undefined;
}

// POST /api/admin/bookings/:bookingId/mark-returned — ACTIVE -> COMPLETED.
// No late-fee or deposit fields on this route (spec 05.5 §3.4/§3.5's
// lateReturnSuggestion and deposit-decision prompts are not implemented
// server-side yet) — deposit actions are out of this session's scope.
export function markBookingReturned(bookingId: string, input: MarkBookingReturnedInput): Promise<AdminBookingDetail> {
  return apiFetch<AdminBookingDetail>(`/admin/bookings/${bookingId}/mark-returned`, { method: 'POST', body: input });
}

// ---------------------------------------------------------------------------
// Availability control (spec 05.5 §4; server/src/services/availability.service.ts)
// ---------------------------------------------------------------------------

export interface AdminAvailabilityRange {
  from: string;
  to: string;
  source: 'BOOKING' | 'BUFFER' | 'ADMIN_BLOCK';
  bookingId?: string;
  blockId?: string;
  reason?: string;
}

export interface AdminAvailabilityResponse {
  carId: string;
  from: string;
  to: string;
  blockedDays: string[];
  blockedRanges: AdminAvailabilityRange[];
}

// GET /api/admin/listings/:carId/availability — E-36. Unlike the public
// calendar (E-08), each range discloses source/bookingId/blockId/reason
// (spec 04 §1.2: "the only place the reason for a blocked day is disclosed").
export function getAdminAvailability(carId: string, from: string, to: string): Promise<AdminAvailabilityResponse> {
  return apiFetch<AdminAvailabilityResponse>(
    `/admin/listings/${carId}/availability${buildQueryString({ from, to })}`,
  );
}

export interface CreateAvailabilityBlockInput {
  from: string;
  to: string;
  reason: string;
  force?: boolean | undefined;
}

export interface CreateAvailabilityBlockResult {
  blockId: string;
  blockedDays: string[];
  skippedDays: string[];
}

// POST /api/admin/listings/:carId/availability-blocks — E-34. On a
// non-forced conflict the server responds 409 CONFLICT { reason:
// "DAYS_ALREADY_LOCKED", conflictingDays, conflictingSources } (spec 05.5
// §4.4) — the caller re-offers `force: true` rather than retrying blindly.
export function createAvailabilityBlock(
  carId: string,
  input: CreateAvailabilityBlockInput,
): Promise<CreateAvailabilityBlockResult> {
  return apiFetch<CreateAvailabilityBlockResult>(`/admin/listings/${carId}/availability-blocks`, {
    method: 'POST',
    body: input,
  });
}

// DELETE /api/admin/listings/:carId/availability-blocks/:blockId — E-35.
// ADMIN_BLOCK-source rows only; guardBlockIsAdminOwned rejects a BOOKING/
// BUFFER-source block id server-side (unreachable from this UI, which never
// offers a delete control on a non-ADMIN_BLOCK range).
export function deleteAvailabilityBlock(carId: string, blockId: string): Promise<void> {
  return apiFetch<void>(`/admin/listings/${carId}/availability-blocks/${blockId}`, { method: 'DELETE' });
}
