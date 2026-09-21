import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingStatus } from '@rango/shared';
import { BOOKING_STATUSES } from '@rango/shared';
import { cancelOwnBooking, downloadOwnBookingAgreement, listOwnBookings, type OwnBooking } from '../../api/bookings';
import { ApiError } from '../../lib/apiClient';
import { todayIso } from '../../lib/dateUtc';
import { AccountShell } from '../../components/account/AccountShell';
import { EmptyState } from '../../components/public/EmptyState';
import { BookingStatusBadge } from '../../components/account/StatusBadge';
import { bookingStatusMeta, isStaleRequest } from '../../lib/statusMeta';
import { Badge, Button, Modal, ModalBody, ModalFooter, Select } from '../../components/ui';

const STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  CANCELLATION_REQUESTED: 'Cancellation requested',
  TERMINATED: 'Ended early',
  NO_SHOW: 'No-show',
};

export function RenterDashboardPage() {
  return (
    <AccountShell>
      <RenterDashboard />
    </AccountShell>
  );
}

// Mirrors server/src/services/booking.service.ts's AGREEMENT_ELIGIBLE_STATUSES
// — available from the moment a request is sent (the customer
// acknowledgement is captured at request time); only REJECTED/CANCELLED
// (never confirmed) have nothing to put in the document.
const AGREEMENT_ELIGIBLE_STATUSES: BookingStatus[] = [
  'REQUESTED',
  'CONFIRMED',
  'CANCELLATION_REQUESTED',
  'ACTIVE',
  'COMPLETED',
  'TERMINATED',
  'NO_SHOW',
];

function RenterDashboard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<OwnBooking | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const today = todayIso();

  async function handleDownloadAgreement(bookingId: string) {
    setDownloadingId(bookingId);
    try {
      await downloadOwnBookingAgreement(bookingId);
    } finally {
      setDownloadingId(null);
    }
  }

  const query = useQuery({
    queryKey: ['own-bookings', 'renter', statusFilter, page],
    queryFn: () =>
      listOwnBookings({
        role: 'RENTER',
        status: statusFilter ? [statusFilter] : undefined,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelOwnBooking(bookingId),
    onSuccess: () => {
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ['own-bookings', 'renter'] });
    },
  });

  const bookings = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-display-md text-neutral-900">My requests</h1>
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as BookingStatus | '');
            setPage(1);
          }}
          className="w-auto"
        >
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
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
            title="Couldn't load your requests"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        </div>
      )}

      {!query.isLoading && !query.isError && bookings.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="You haven't requested any cars yet."
            description="Browse the catalog and send a request for your dates."
            action={{ label: 'Browse cars', onClick: () => navigate('/cars') }}
          />
        </div>
      )}

      {!query.isLoading && !query.isError && bookings.length > 0 && (
        <ul className="mt-6 space-y-3">
          {bookings.map((booking) => {
            const statusMeta = bookingStatusMeta(booking.status);
            const stale = isStaleRequest(booking.status, booking.startDate, today);
            const thumbnail = booking.car.images[0];
            return (
              <li key={booking.id} className="flex gap-4 rounded-lg border border-border bg-surface-card p-4">
                <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-md bg-surface-sunken sm:block">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={`${booking.car.make} ${booking.car.model}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-caption text-neutral-400">
                      No photo
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-body-md font-medium text-neutral-900">
                      {booking.car.make} {booking.car.model} {booking.car.year}
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-600">
                      {booking.startDate} → {booking.endDate} · {booking.days} day{booking.days === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-600">
                      ₹{booking.totalAmount.toLocaleString('en-IN')}
                      {booking.amountReceived > 0 && (
                        <span className="ml-2 text-neutral-500">
                          (₹{booking.amountReceived.toLocaleString('en-IN')} received)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <BookingStatusBadge status={booking.status} />
                    {stale && <Badge status="warning">Can no longer be confirmed</Badge>}
                  </div>
                </div>

                <p className="mt-2 text-body-sm text-neutral-600">{statusMeta.explain}</p>

                {(booking.status === 'REJECTED' && booking.rejectionReason) ||
                (booking.status === 'CANCELLED' && booking.cancellationReason) ||
                (booking.status === 'TERMINATED' && booking.terminationReason) ? (
                  <p className="mt-1 text-body-sm text-neutral-500">
                    {booking.rejectionReason ?? booking.cancellationReason ?? booking.terminationReason}
                  </p>
                ) : null}

                {/* Owner contact is deliberately absent from this list view — spec 02
                    §7.2: BookingSummary carries no counterparty at all, in any state,
                    so a list endpoint can't be used to harvest contacts in bulk. Party
                    contact never carries a phone number at all any more (spec 04 §4.1
                    RULE GH-1, godown-mediated handover) — pickup details, not owner
                    contact, are what appear once a request is confirmed. */}
                <p className="mt-2 text-caption text-neutral-400">
                  Pickup details appear once your request is confirmed.
                </p>

                {(booking.status === 'REQUESTED' || AGREEMENT_ELIGIBLE_STATUSES.includes(booking.status)) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {booking.status === 'REQUESTED' && (
                      <Button variant="secondary" size="sm" onClick={() => setCancelTarget(booking)}>
                        Cancel request
                      </Button>
                    )}
                    {AGREEMENT_ELIGIBLE_STATUSES.includes(booking.status) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={downloadingId === booking.id}
                        onClick={() => handleDownloadAgreement(booking.id)}
                      >
                        Download Rental Agreement
                      </Button>
                    )}
                  </div>
                )}
                </div>
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

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} title="Withdraw this request?">
        <ModalBody>
          <p className="text-body-md text-neutral-700">
            Withdraws your request — nothing was ever held, so nothing changes for the owner. This can't be undone.
          </p>
          {cancelMutation.isError && (
            <p role="alert" className="mt-3 text-body-sm text-status-danger-fg">
              {cancelMutation.error instanceof ApiError
                ? cancelMutation.error.message
                : 'Something went wrong. Please try again.'}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setCancelTarget(null)}>
            Keep request
          </Button>
          <Button
            variant="danger"
            isLoading={cancelMutation.isPending}
            onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
          >
            Withdraw request
          </Button>
        </ModalFooter>
      </Modal>

      <p className="mt-8 text-caption text-neutral-400">
        <Link to="/cars" className="text-brand-accent hover:underline">
          Browse more cars →
        </Link>
      </p>
    </div>
  );
}
