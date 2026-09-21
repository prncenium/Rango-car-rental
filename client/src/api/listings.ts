import type {
  BookingStatus,
  CarFuelType,
  CarListingState,
  CarModerationStatus,
  CarTransmission,
  CreateCarDto,
  UpdateCarDto,
} from '@rango/shared';
import { apiFetch, apiFetchWithMeta, ApiError } from '../lib/apiClient';
import { getCsrfToken } from '../lib/csrf';
import type { ListMeta } from './bookings';

// GET /api/user/listings (E-14) — server/src/services/car.service.ts's
// listOwnListings() returns raw, owner-scoped `.lean()` Car documents (no
// embedded bookings — spec 02 §7.2's `OwnerCar & { bookings }` shape is only
// on the single-record GET /api/user/listings/:carId, E-15, below).
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
  extraKmRatePerKm?: number;
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

// GET /api/user/listings/:carId (E-15) — single-record read, owner-scoped.
// Server embeds `bookings: BookingSummary[]` per spec 02 §7.2's OwnerCar
// shape (no counterparty on these rows — see the service's own comment).
// `availableActions[]` still isn't wired server-side in this pass.
export interface OwnListingBooking {
  _id: string;
  startDate: string;
  endDate: string;
  days: number;
  ratePerDaySnapshot: number;
  totalAmount: number;
  amountReceived: number;
  status: BookingStatus;
  createdAt: string;
}

export function getOwnListing(carId: string): Promise<OwnCar & { bookings: OwnListingBooking[] }> {
  return apiFetch<OwnCar & { bookings: OwnListingBooking[] }>(`/user/listings/${carId}`);
}

// POST /api/user/listings (E-09). The form never collects `images` — per
// specs/05-ui-ux-public.md §3.7's Create flow Step 1, createCarDto's
// `images` defaults to `[]` when absent (shared/src/dto/car.ts's note on why
// images can't be supplied at creation time at all).
export function createListing(input: CreateCarDto): Promise<OwnCar> {
  return apiFetch<OwnCar>('/user/listings', { method: 'POST', body: input });
}

// PATCH /api/user/listings/:carId (E-10) — every field optional, minimum one
// present (enforced both by updateCarDto and by callers only sending dirty
// fields, mirroring client/src/pages/user/Profile.tsx's dirty-only pattern).
export function updateListing(carId: string, input: UpdateCarDto): Promise<OwnCar> {
  return apiFetch<OwnCar>(`/user/listings/${carId}`, { method: 'PATCH', body: input });
}

// POST /api/user/listings/:carId/submit (E-11, exception E1) —
// DRAFT|REJECTED -> PENDING_APPROVAL. No body.
export function submitListing(carId: string): Promise<OwnCar> {
  return apiFetch<OwnCar>(`/user/listings/${carId}/submit`, { method: 'POST', body: {} });
}

// POST /api/user/listings/:carId/images (docs/design/02-image-storage.md) —
// multipart upload, owner-only, gated server-side by
// guardEditableModerationState (DRAFT/REJECTED). Returns the full updated
// Car document per design §10.3's "a successful mutation returns the full
// updated resource" rule, so the caller can replace its cached images[]
// wholesale rather than guessing at the new URLs' order.
//
// Uses XMLHttpRequest rather than fetch (apiClient's apiUpload) solely
// because fetch has no upload-progress event — PhotoUploader's per-batch
// progress bar (spec 05 §3.7's "per-file progress") needs one.
export function uploadListingImages(carId: string, files: File[], onProgress?: (percent: number) => void): Promise<OwnCar> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/user/listings/${carId}/images`);
    xhr.withCredentials = true;
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Please check your connection and try again.'));
    xhr.onload = () => {
      let json: { data: OwnCar } | { error: { code: string; message: string; details?: unknown; requestId: string } };
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Upload failed. Please try again.'));
        return;
      }
      if ('error' in json) {
        reject(new ApiError(xhr.status, json.error));
        return;
      }
      resolve(json.data);
    };
    xhr.send(formData);
  });
}
