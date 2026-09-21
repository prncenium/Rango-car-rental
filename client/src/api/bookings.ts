import type { BookingStatus } from '@rango/shared';
import { apiFetch, apiFetchBlob, apiFetchWithMeta, downloadBlob } from '../lib/apiClient';

// requestBookingDto (spec 02 §10.2 E-17 / exception E4) — mirrors
// server/src/routes/user.booking.routes.ts's requestBookingBody exactly.
// renter/owner/totalAmount/amountReceived/status are never sent — the
// server rejects any of those keys with 400 VALIDATION_FAILED (D10).
export interface RequestBookingInput {
  carId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  agreedToTerms: true;
}

// POST /api/user/bookings (E-17) returns the created Booking document as-is
// (server/src/services/booking.service.ts's requestBooking()) — there is no
// response-shaping layer yet that serializes it down to spec 02 §7.2's
// BookingDetail (no PartyContact, no id-vs-_id normalization). Only the
// fields this flow actually reads are declared here; Mongoose's default
// toJSON also includes `_id`/`__v`/etc., which are ignored.
export interface RequestedBooking {
  _id: string;
  car: string;
  startDate: string;
  endDate: string;
  days: number;
  ratePerDaySnapshot: number;
  totalAmount: number;
  status: 'REQUESTED';
  createdAt: string;
}

export function requestBooking(input: RequestBookingInput): Promise<RequestedBooking> {
  return apiFetch<RequestedBooking>('/user/bookings', { method: 'POST', body: input });
}

// GET /api/user/bookings (E-20). listOwnBookings() in
// server/src/services/booking.service.ts now populates `car` (make/model/
// year/etc.), matching spec 02 §7.2's `BookingSummary.car: PublicCarSummary`.
// `renter`/`owner` stay as raw id strings deliberately — §7.2 is explicit
// that "BookingSummary carries no counterparty at all, in any state" (so a
// list endpoint can't be used to harvest contacts in bulk); PartyContact only
// ever appears on the single-record BookingDetail read (E-21).
// Straight off `.populate('car', '...').lean()` with no `_id`->`id` mapping
// layer — same "carries Mongo's `_id` verbatim" shape convention as
// AdminBookingCarSummary in api/admin.ts.
export interface OwnBookingCar {
  _id: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  images: string[];
  location: { city: string; state: string };
}

export interface OwnBooking {
  id: string;
  car: OwnBookingCar;
  renter: string;
  owner: string;
  startDate: string;
  endDate: string;
  days: number;
  ratePerDaySnapshot: number;
  totalAmount: number;
  amountReceived: number;
  status: BookingStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  terminationReason?: string;
  createdAt: string;
}

export interface ListOwnBookingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: 'createdAt:desc' | 'startDate:asc' | 'startDate:desc' | undefined;
  role?: 'RENTER' | 'OWNER' | undefined;
  status?: BookingStatus[] | undefined;
}

export interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  sort: string;
}

function buildBookingsQueryString(query: ListOwnBookingsQuery): string {
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

export function listOwnBookings(
  query: ListOwnBookingsQuery = {},
): Promise<{ data: OwnBooking[]; meta: ListMeta }> {
  return apiFetchWithMeta<OwnBooking[], ListMeta>(`/user/bookings${buildBookingsQueryString(query)}`);
}

// POST /api/user/bookings/:bookingId/cancel (E-18 / exception E5) — the
// renter withdrawing their own still-REQUESTED request. `reason` is
// optional here (unlike request-cancellation on a CONFIRMED booking, which
// does not exist as a wired endpoint in this pass).
export function cancelOwnBooking(bookingId: string, reason?: string): Promise<OwnBooking> {
  return apiFetch<OwnBooking>(`/user/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

// GET /api/user/bookings/:bookingId/agreement — only reachable once the
// booking has been confirmed (server-side guard); scoped to the caller's
// own booking, 404 on someone else's.
export async function downloadOwnBookingAgreement(bookingId: string): Promise<void> {
  const blob = await apiFetchBlob(`/user/bookings/${bookingId}/agreement`);
  downloadBlob(blob, `rental-agreement-${bookingId}.pdf`);
}
