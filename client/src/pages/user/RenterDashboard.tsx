import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingStatus } from '@rango/shared';
import { BOOKING_STATUSES } from '@rango/shared';
import { cancelOwnBooking, listOwnBookings, type OwnBooking } from '../../api/bookings';
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

function RenterDashboard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<OwnBooking | null>(null);
  const queryClient = useQueryClient();
  const today = todayIso();

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
            return (
              <li key={booking.id} className="rounded-lg border border-border bg-surface-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-mono-sm text-neutral-500">
                      Car #{booking.car.slice(-6).toUpperCase()}
                    </p>
                    <p className="mt-1 text-body-md text-neutral-900">
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

                {/* Owner contact — not renderable yet: GET /api/user/bookings returns raw
                    ids only (no PartyContact), see client/src/api/bookings.ts's comment. */}
                <p className="mt-2 text-caption text-neutral-400">
                  Contact details aren't shown in this list yet — they appear once your request is confirmed.
                </p>

                {booking.status === 'REQUESTED' && (
                  <div className="mt-3">
                    <Button variant="secondary" size="sm" onClick={() => setCancelTarget(booking)}>
                      Cancel request
                    </Button>
                  </div>
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
