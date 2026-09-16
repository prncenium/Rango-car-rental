import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CarListingState, CarModerationStatus } from '@rango/shared';
import { CAR_LISTING_STATES, CAR_MODERATION_STATUSES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { EmptyState } from '../../components/public/EmptyState';
import { Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Button } from '../../components/ui';
import { adminListListings } from '../../api/admin';
import { carModerationMeta, carListingMeta } from '../../lib/statusMeta';
import { Badge } from '../../components/ui/Badge';

const MODERATION_LABELS: Record<CarModerationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const LISTING_LABELS: Record<CarListingState, string> = {
  UNLISTED: 'Unlisted',
  LISTED: 'Listed',
  DELISTED: 'Delisted',
};

export function AdminListingModerationPage() {
  return (
    <AdminShell>
      <ListingModerationQueue />
    </AdminShell>
  );
}

function ListingModerationQueue() {
  const [searchParams] = useSearchParams();
  const [moderationStatus, setModerationStatus] = useState<CarModerationStatus | ''>(
    (searchParams.get('moderationStatus') as CarModerationStatus | null) ?? 'PENDING_APPROVAL',
  );
  const [listingState, setListingState] = useState<CarListingState | ''>('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin-listings', moderationStatus, listingState, city, page],
    queryFn: () =>
      adminListListings({
        moderationStatus: moderationStatus ? [moderationStatus] : undefined,
        listingState: listingState ? [listingState] : undefined,
        city: city || undefined,
        // GAP: sort whitelist has no createdAt:asc (see Dashboard.tsx quick-
        // action queue comment) — spec 05.5 §2.1's FIFO default
        // (`sort=createdAt:asc`) isn't requestable from this endpoint yet.
        sort: 'createdAt:desc',
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const listings = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-heading-lg text-neutral-900">Listings</h1>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="Status"
          value={moderationStatus}
          onChange={(e) => {
            setModerationStatus(e.target.value as CarModerationStatus | '');
            setPage(1);
          }}
          className="w-48"
        >
          <option value="">All statuses</option>
          {CAR_MODERATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MODERATION_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          label="Listing state"
          value={listingState}
          onChange={(e) => {
            setListingState(e.target.value as CarListingState | '');
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">Any</option>
          {CAR_LISTING_STATES.map((s) => (
            <option key={s} value={s}>
              {LISTING_LABELS[s]}
            </option>
          ))}
        </Select>
        <div className="w-56">
          <label className="mb-1.5 block text-body-sm font-medium text-neutral-700" htmlFor="city-filter">
            City
          </label>
          <input
            id="city-filter"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. Jaipur"
            className="h-10 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-sm text-neutral-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
        </div>
      </div>

      <div className="mt-6">
        {query.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-none border-b border-border bg-surface-card" />
            ))}
          </div>
        )}

        {query.isError && (
          <EmptyState
            title="Couldn't load listings"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        )}

        {!query.isLoading && !query.isError && listings.length === 0 && (
          <EmptyState
            title="No listings match this filter."
            description="Try a different status or clear the filters."
            action={{
              label: 'Clear filters',
              onClick: () => {
                setModerationStatus('');
                setListingState('');
                setCity('');
                setPage(1);
              },
            }}
          />
        )}

        {!query.isLoading && !query.isError && listings.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Car</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Price/day</TableHeaderCell>
                <TableHeaderCell>Moderation</TableHeaderCell>
                <TableHeaderCell>Listing</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listings.map((car) => {
                const modMeta = carModerationMeta(car.moderationStatus);
                const listMeta = carListingMeta(car.listingState);
                return (
                  <TableRow key={car.id}>
                    <TableCell>
                      <Link to={`/admin/listings/${car.id}`} className="font-medium text-neutral-900 hover:text-brand-accent">
                        {car.make} {car.model} {car.year}
                      </Link>
                      <p className="mt-0.5 font-mono text-mono-sm text-neutral-500">{car.registrationNumber}</p>
                    </TableCell>
                    <TableCell>
                      <p>{car.owner.name}</p>
                      <p className="text-caption text-neutral-500">{car.owner.email}</p>
                    </TableCell>
                    <TableCell>₹{car.rentalPricePerDay.toLocaleString('en-IN')}</TableCell>
                    <TableCell>
                      <Badge status={modMeta.badge}>{modMeta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge status={listMeta.badge}>{listMeta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-body-sm text-neutral-600">
                      {new Date(car.createdAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/listings/${car.id}`}>
                        <Button variant="secondary" size="sm">
                          Review
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-body-sm text-neutral-600">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
