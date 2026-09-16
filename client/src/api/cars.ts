import { apiFetchWithMeta } from '../lib/apiClient';

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
