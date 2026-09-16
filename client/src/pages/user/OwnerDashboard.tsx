import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CarModerationStatus } from '@rango/shared';
import { CAR_MODERATION_STATUSES } from '@rango/shared';
import { listOwnListings } from '../../api/listings';
import { AccountShell } from '../../components/account/AccountShell';
import { EmptyState } from '../../components/public/EmptyState';
import { ListingStateBadge, ModerationStatusBadge } from '../../components/account/StatusBadge';
import { carModerationMeta } from '../../lib/statusMeta';
import { Button, Select } from '../../components/ui';

const MODERATION_LABELS: Record<CarModerationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Changes needed',
};

export function OwnerDashboardPage() {
  return (
    <AccountShell>
      <OwnerDashboard />
    </AccountShell>
  );
}

function OwnerDashboard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<CarModerationStatus | ''>('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['own-listings', statusFilter, page],
    queryFn: () =>
      listOwnListings({
        moderationStatus: statusFilter ? [statusFilter] : undefined,
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
        <h1 className="font-display text-display-md text-neutral-900">My listings</h1>
        <div className="flex items-center gap-3">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as CarModerationStatus | '');
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">All statuses</option>
            {CAR_MODERATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MODERATION_LABELS[s]}
              </option>
            ))}
          </Select>
          {/* spec 05 §3.6 / route map — Create Listing isn't built in this
              pass (task scope: "no listing form or image upload yet"). This
              link mirrors Home.tsx's existing forward-reference to the same
              not-yet-built route. */}
          <Link to="/account/listings/new">
            <Button variant="primary" size="sm">
              + List a car
            </Button>
          </Link>
        </div>
      </div>

      {query.isLoading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface-card" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="mt-6">
          <EmptyState
            title="Couldn't load your listings"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        </div>
      )}

      {!query.isLoading && !query.isError && listings.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="You haven't listed a car yet."
            description="List your car so admins can review and publish it."
            action={{ label: 'List a car', onClick: () => navigate('/account/listings/new') }}
          />
        </div>
      )}

      {!query.isLoading && !query.isError && listings.length > 0 && (
        <ul className="mt-6 space-y-3">
          {listings.map((car) => {
            const statusMeta = carModerationMeta(car.moderationStatus);
            return (
              <li key={car.id} className="rounded-lg border border-border bg-surface-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-body-md font-medium text-neutral-900">
                      {car.make} {car.model} {car.year}
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-600">
                      {car.location.city}, {car.location.state}
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-600">
                      ₹{car.rentalPricePerDay.toLocaleString('en-IN')}/day
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <ModerationStatusBadge status={car.moderationStatus} />
                    {car.moderationStatus === 'APPROVED' && <ListingStateBadge state={car.listingState} />}
                  </div>
                </div>

                <p className="mt-2 text-body-sm text-neutral-600">{statusMeta.explain}</p>

                {car.moderationStatus === 'REJECTED' && car.rejectionReason && (
                  <p className="mt-1 text-body-sm text-neutral-500">
                    An admin asked for changes: "{car.rejectionReason}"
                  </p>
                )}
                {car.listingState === 'DELISTED' && car.delistedReason && (
                  <p className="mt-1 text-body-sm text-neutral-500">Delisted: "{car.delistedReason}"</p>
                )}
              </li>
            );
          })}
        </ul>
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
  );
}
