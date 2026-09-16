import { apiFetch } from '../lib/apiClient';

// requestBookingDto (spec 02 §10.2 E-17 / exception E4) — mirrors
// server/src/routes/user.booking.routes.ts's requestBookingBody exactly.
// renter/owner/totalAmount/amountReceived/status are never sent — the
// server rejects any of those keys with 400 VALIDATION_FAILED (D10).
export interface RequestBookingInput {
  carId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// POST /api/user/bookings (E-17) returns the created Booking document as-is
// (server/src/services/booking.service.ts's requestBooking()) — there is no
// response-shaping layer yet that serializes it down to spec 02 §7.2's
// BookingDetail (no PartyContact, no id-vs-_id normalization). Only the
// fields this flow actually reads are declared here; Mongoose's default
// toJSON also includes `_id`/`__v`/etc., which are ignored.
export interface RequestedBooking {
  id: string;
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
