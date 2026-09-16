import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BookingStatus } from '@rango/shared';
import { BOOKING_STATUSES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { EmptyState } from '../../components/public/EmptyState';
import { Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Button } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { adminListBookings } from '../../api/admin';
import { bookingStatusMeta } from '../../lib/statusMeta';

const STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  ACTIVE: 'In progress',
  CANCELLATION_REQUESTED: 'Cancellation requested',
  COMPLETED: 'Completed',
  TERMINATED: 'Ended early',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

export function AdminBookingQueuePage() {
  return (
    <AdminShell>
      <BookingQueue />
    </AdminShell>
  );
}

function BookingQueue() {
  const [status, setStatus] = useState<BookingStatus | ''>('REQUESTED');
  // spec 05.5 §3.1's "needs attention" filter chip — conflictedOnly/staleOnly
  // isolate a REQUESTED booking whose dates overlap another request or have
  // sat unreviewed; unpaidOnly/overdueOnly surface the money/handover risks.
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [conflictedOnly, setConflictedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin-bookings', status, unpaidOnly, overdueOnly, staleOnly, conflictedOnly, page],
    queryFn: () =>
      adminListBookings({
        status: status ? [status] : undefined,
        unpaidOnly: unpaidOnly || undefined,
        overdueOnly: overdueOnly || undefined,
        staleOnly: staleOnly || undefined,
        conflictedOnly: conflictedOnly || undefined,
        sort: 'createdAt:desc',
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const bookings = query.data?.data ?? [];
  const meta = query.data?.meta;
  const anyFilterActive = unpaidOnly || overdueOnly || staleOnly || conflictedOnly || status !== '';

  function clearFilters() {
    setStatus('');
    setUnpaidOnly(false);
    setOverdueOnly(false);
    setStaleOnly(false);
    setConflictedOnly(false);
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-heading-lg text-neutral-900">Bookings</h1>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as BookingStatus | '');
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap items-center gap-3 pb-2">
          <FilterCheckbox label="Unpaid" checked={unpaidOnly} onChange={setUnpaidOnly} />
          <FilterCheckbox label="Overdue return" checked={overdueOnly} onChange={setOverdueOnly} />
          <FilterCheckbox label="Stale" checked={staleOnly} onChange={setStaleOnly} />
          <FilterCheckbox label="Conflicted" checked={conflictedOnly} onChange={setConflictedOnly} />
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
            title="Couldn't load bookings"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        )}

        {!query.isLoading && !query.isError && bookings.length === 0 && (
          <EmptyState
            title="No bookings match this filter."
            description="Try a different status or clear the filters."
            action={anyFilterActive ? { label: 'Clear filters', onClick: clearFilters } : undefined}
          />
        )}

        {!query.isLoading && !query.isError && bookings.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Car</TableHeaderCell>
                <TableHeaderCell>Renter</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Dates</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map((booking) => {
                const meta = bookingStatusMeta(booking.status);
                return (
                  <TableRow key={booking._id}>
                    <TableCell>
                      <Link
                        to={`/admin/bookings/${booking._id}`}
                        className="font-medium text-neutral-900 hover:text-brand-accent"
                      >
                        {booking.car.make} {booking.car.model}
                      </Link>
                      <p className="mt-0.5 font-mono text-mono-sm text-neutral-500">{booking.car.registrationNumber}</p>
                    </TableCell>
                    <TableCell>{booking.renter.name}</TableCell>
                    <TableCell>{booking.owner.name}</TableCell>
                    <TableCell className="text-body-sm text-neutral-600">
                      {new Date(booking.startDate).toLocaleDateString('en-IN')} →{' '}
                      {new Date(booking.endDate).toLocaleDateString('en-IN')} ({booking.days}d)
                    </TableCell>
                    <TableCell>₹{booking.totalAmount.toLocaleString('en-IN')}</TableCell>
                    <TableCell>
                      <Badge status={meta.badge}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/bookings/${booking._id}`}>
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

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-body-sm text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded-sm border-border-strong text-brand-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
      />
      {label}
    </label>
  );
}
