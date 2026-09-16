import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingStatus } from '@rango/shared';
import { BOOKING_STATUSES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { EmptyState } from '../../components/public/EmptyState';
import {
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Button,
  Toast,
  ToastViewport,
} from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { adminListBookings, confirmBooking, rejectBooking, type AdminBookingListItem } from '../../api/admin';
import { bookingStatusMeta } from '../../lib/statusMeta';
import { ApiError } from '../../lib/apiClient';
import { useQueueKeyboardNav } from '../../lib/useQueueKeyboardNav';
import { cn } from '../../components/ui/cn';

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

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GUARD_FAILED') return err.message || 'This action cannot be completed right now.';
    if (err.code === 'CONFLICT') return 'This record has already changed. Refreshing.';
    if (err.code === 'INVALID_TRANSITION') return 'This record has already changed. Refreshing.';
    if (err.code === 'NOT_FOUND') return 'This booking is no longer available.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [rowAction, setRowAction] = useState<{ bookingId: string; kind: 'confirm' | 'reject' } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const queryClient = useQueryClient();
  const queryKey = ['admin-bookings', status, unpaidOnly, overdueOnly, staleOnly, conflictedOnly, page] as const;

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const query = useQuery({
    queryKey,
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
    setFocusedIndex(0);
  }

  type BookingsCache = { data: AdminBookingListItem[]; meta: NonNullable<typeof meta> } | undefined;

  // RULE ADM-2 (spec 05.5 §0.5) — row leaves the queue optimistically before
  // the response returns; rolled back to the pre-action snapshot on error.
  function removeRowOptimistically(bookingId: string): BookingsCache {
    const previous = queryClient.getQueryData<BookingsCache>(queryKey);
    queryClient.setQueryData<BookingsCache>(queryKey, (current) => {
      if (!current) return current;
      return {
        data: current.data.filter((b) => b._id !== bookingId),
        meta: { ...current.meta, total: Math.max(0, current.meta.total - 1) },
      };
    });
    return previous;
  }

  function rollback(previous: BookingsCache) {
    queryClient.setQueryData<BookingsCache>(queryKey, previous);
  }

  function afterSuccess() {
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-counts'] });
  }

  const confirmMutation = useMutation({
    mutationFn: (bookingId: string) => confirmBooking(bookingId),
    onMutate: (bookingId: string) => ({ previous: removeRowOptimistically(bookingId) }),
    onSuccess: () => {
      afterSuccess();
      pushToast('success', "Confirmed. Both parties can now see each other's phone number.");
      setRowAction(null);
    },
    onError: (err, _bookingId, context) => {
      rollback((context as { previous: BookingsCache }).previous);
      pushToast('danger', errorToastText(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) => rejectBooking(bookingId, reason),
    onMutate: ({ bookingId }) => ({ previous: removeRowOptimistically(bookingId) }),
    onSuccess: () => {
      afterSuccess();
      pushToast('success', 'Booking request rejected.');
      setRowAction(null);
    },
    onError: (err, _vars, context) => {
      rollback((context as { previous: BookingsCache }).previous);
      pushToast('danger', errorToastText(err));
    },
  });

  useQueueKeyboardNav({
    rowCount: bookings.length,
    focusedIndex,
    setFocusedIndex,
    onApprove: (index) => {
      const b = bookings[index];
      if (b && b.status === 'REQUESTED') setRowAction({ bookingId: b._id, kind: 'confirm' });
    },
    onReject: (index) => {
      const b = bookings[index];
      if (b && b.status === 'REQUESTED') setRowAction({ bookingId: b._id, kind: 'reject' });
    },
    onEscape: () => setRowAction(null),
    enabled: !rowAction,
  });

  const rowActionBooking = rowAction ? bookings.find((b) => b._id === rowAction.bookingId) : undefined;

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
            setFocusedIndex(0);
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
              {bookings.map((booking, index) => {
                const meta = bookingStatusMeta(booking.status);
                const requested = booking.status === 'REQUESTED';
                return (
                  <TableRow
                    key={booking._id}
                    onClick={() => setFocusedIndex(index)}
                    className={cn(index === focusedIndex && 'bg-surface-sunken ring-1 ring-inset ring-focus-ring')}
                  >
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
                      <div className="flex items-center gap-1.5">
                        {requested && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setRowAction({ bookingId: booking._id, kind: 'confirm' })}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setRowAction({ bookingId: booking._id, kind: 'reject' })}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Link to={`/admin/bookings/${booking._id}`}>
                          <Button variant="secondary" size="sm">
                            Review
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                setFocusedIndex(0);
              }}
            >
              Previous
            </Button>
            <span className="text-body-sm text-neutral-600">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!meta.hasNext}
              onClick={() => {
                setPage((p) => p + 1);
                setFocusedIndex(0);
              }}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <ConfirmReasonModal
        open={rowAction?.kind === 'confirm'}
        onClose={() => setRowAction(null)}
        onConfirm={() => rowAction && confirmMutation.mutate(rowAction.bookingId)}
        title="Confirm this booking?"
        description="Confirming will reveal both parties' phone numbers to each other. Make sure the owner has agreed the car is free and the renter has been reached before confirming."
        reasonLabel="Note (not sent anywhere yet)"
        confirmLabel="Confirm booking"
        isSubmitting={confirmMutation.isPending}
      />

      <ConfirmReasonModal
        open={rowAction?.kind === 'reject'}
        onClose={() => setRowAction(null)}
        onConfirm={(reason) => rowAction && rejectMutation.mutate({ bookingId: rowAction.bookingId, reason })}
        title={rowActionBooking ? `Reject ${rowActionBooking.car.make} ${rowActionBooking.car.model}?` : 'Reject this booking request?'}
        reasonLabel="Reason"
        confirmLabel="Reject request"
        confirmVariant="danger"
        isSubmitting={rejectMutation.isPending}
      />

      <ToastViewport>
        {toasts.map((t) => (
          <Toast key={t.id} variant={t.variant} onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
            {t.text}
          </Toast>
        ))}
      </ToastViewport>
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
