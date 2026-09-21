import { apiFetch, apiFetchWithMeta } from '../lib/apiClient';

// PublicCarSummary (spec 02 §7.2) — /api/public/cars list item.
export interface PublicCarSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  transmission: 'MANUAL' | 'AUTOMATIC';
  fuelType: string;
  seats: number;
  mileageKm: number;
  color?: string;
  rentalPricePerDay: number;
  location: { city: string; state: string };
  primaryImageUrl?: string;
  imageCount: number;
  publishedAt: string;
}

// PublicCarDetail (spec 02 §7.2) — GET /api/public/cars/:carId (E-07).
// Deliberately excludes owner (any form), registrationNumber,
// moderationStatus, listingState, rejectionReason, booking history — the
// server's toPublicCarDetail() never serializes them (spec 05 §3.3).
// Note: server/src/services/publicCar.service.ts's toPublicCarSummary()
// never serializes rentalPricePerWeek either, so — unlike spec 05 §3.3's
// wireframe, which shows a weekly-rate note "if present" — this client has
// no way to know a car's weekly rate at all. The weekly-rate note is
// therefore not rendered anywhere; closing that gap needs a server change,
// out of scope here.
export interface PublicCarDetail extends PublicCarSummary {
  description?: string;
  images: string[];
  location: { city: string; state: string; geo?: { type: 'Point'; coordinates: [number, number] } };
  // Detail-only (not on PublicCarSummary) — needed for the acknowledgement
  // preview on the Booking Request page, shown before a renter agrees to the T&Cs.
  depositAmount: number;
  // ₹/km charged once total distance driven exceeds days × 300km (the daily
  // distance cap — specs/04-business-logic.md §2.2a).
  extraKmRatePerKm: number;
}

// AvailabilityResponse (spec 02 §7.2) — GET /api/public/cars/:carId/availability
// (E-08). Days only, never a bookingId/renter/source (spec 02 "Leakage" rule).
export interface AvailabilityResponse {
  carId: string;
  from: string;
  to: string;
  blockedDays: string[];
  blockedRanges: { from: string; to: string }[];
}

export type SortOption =
  | 'publishedAt:desc'
  | 'rentalPricePerDay:asc'
  | 'rentalPricePerDay:desc'
  | 'year:desc'
  | 'seats:asc';

// publicCarQueryDto (spec 02 §9 E-06) — mirrors server/src/routes/public.car.routes.ts.
// No moderationStatus/listingState/ownerId here: those params don't exist in this
// DTO at all, matching the server's strictObject.
export interface PublicCarQuery {
  page?: number;
  limit?: number;
  sort?: SortOption;
  city?: string;
  state?: string;
  q?: string;
  make?: string[];
  transmission?: ('MANUAL' | 'AUTOMATIC')[];
  fuelType?: string[];
  seatsMin?: number;
  seatsMax?: number;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  availableFrom?: string;
  availableTo?: string;
}

export interface PublicCarListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  sort: string;
}

function buildQueryString(query: PublicCarQuery): string {
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

export function listPublicCars(
  query: PublicCarQuery = {},
): Promise<{ data: PublicCarSummary[]; meta: PublicCarListMeta }> {
  return apiFetchWithMeta<PublicCarSummary[], PublicCarListMeta>(`/public/cars${buildQueryString(query)}`);
}

// GET /api/public/cars/:carId (E-07). 404 identically for "does not exist"
// and "not publicly visible" (spec 02 §7.1) — callers branch on ApiError.status.
export function getPublicCarDetail(carId: string): Promise<PublicCarDetail> {
  return apiFetch<PublicCarDetail>(`/public/cars/${carId}`);
}

// GET /api/public/cars/:carId/availability (E-08). `from`/`to` are
// YYYY-MM-DD, half-open, capped at a 180-day window server-side.
export function getPublicAvailability(carId: string, from: string, to: string): Promise<AvailabilityResponse> {
  return apiFetch<AvailabilityResponse>(
    `/public/cars/${carId}/availability?${new URLSearchParams({ from, to }).toString()}`,
  );
}
