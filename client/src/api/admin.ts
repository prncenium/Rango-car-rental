import type { CarFuelType, CarListingState, CarModerationStatus, CarTransmission } from '@rango/shared';
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
