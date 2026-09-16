import type { CarFuelType, CarListingState, CarModerationStatus, CarTransmission } from '@rango/shared';
import { apiFetchWithMeta } from '../lib/apiClient';
import type { ListMeta } from './bookings';

// GET /api/user/listings (E-14) — server/src/services/car.service.ts's
// listOwnListings() returns raw, owner-scoped `.lean()` Car documents. There
// is no embedded `bookings: BookingSummary[]` (spec 02 §7.2's OwnerCar shape)
// on this response — that only exists on the single-record GET
// /api/user/listings/:carId (E-15), which is not wired in this pass — so the
// Owner Dashboard here shows listing/moderation status only, no per-car
// booking section.
export interface OwnCar {
  id: string;
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
  rejectionReason?: string;
  delistedReason?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOwnListingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: 'createdAt:desc' | 'updatedAt:desc' | 'rentalPricePerDay:asc' | 'rentalPricePerDay:desc' | undefined;
  moderationStatus?: CarModerationStatus[] | undefined;
  listingState?: CarListingState[] | undefined;
}

function buildListingsQueryString(query: ListOwnListingsQuery): string {
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

export function listOwnListings(
  query: ListOwnListingsQuery = {},
): Promise<{ data: OwnCar[]; meta: ListMeta }> {
  return apiFetchWithMeta<OwnCar[], ListMeta>(`/user/listings${buildListingsQueryString(query)}`);
}
