import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { Button, Input, Select, Textarea, Toast, ToastViewport } from '../../components/ui';
import { EmptyState } from '../../components/public/EmptyState';
import { AvailabilityCalendar } from '../../components/public/AvailabilityCalendar';
import { ApiError } from '../../lib/apiClient';
import {
  adminListListings,
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  getAdminAvailability,
  type AdminAvailabilityRange,
} from '../../api/admin';
import { addMonthsIso, fromIso, monthStartIso, todayIso } from '../../lib/dateUtc';

// spec 05.5 §4.1's master calendar renders every car in one grid; this pass
// scopes the car picker to a single row at a time (a batched
// `GET /admin/availability?carIds[]=...` endpoint does not exist — spec
// 05.5 §4.1 ADM-OQ-15 flags exactly this N-requests-per-render cost without
// resolving it) rather than issuing one call per fleet car on every render.
const SOURCE_LABELS: Record<AdminAvailabilityRange['source'], string> = {
  BOOKING: 'Booking',
  BUFFER: 'Turnaround buffer',
  ADMIN_BLOCK: 'Admin block',
};

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'CONFLICT') {
      const details = err.details as { conflictingDays?: string[] } | undefined;
      if (details?.conflictingDays?.length) {
        return `These dates are already locked: ${details.conflictingDays.join(', ')}.`;
      }
      return 'Some of these dates are already locked.';
    }
    if (err.code === 'NOT_FOUND') return 'This block no longer exists.';
    if (err.code === 'VALIDATION_FAILED') return 'Please check the form and try again.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function AdminCalendarPage() {
  return (
    <AdminShell>
      <CalendarView />
    </AdminShell>
  );
}

function CalendarView() {
  const queryClient = useQueryClient();
  const [carId, setCarId] = useState<string>('');
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = fromIso(todayIso());
    return monthStartIso(today.getUTCFullYear(), today.getUTCMonth());
  });
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminAvailabilityRange | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const carsQuery = useQuery({
    queryKey: ['admin-calendar-cars'],
    queryFn: () => adminListListings({ sort: 'createdAt:desc', limit: 100 }),
  });
  const cars = carsQuery.data?.data ?? [];

  const monthEnd = addMonthsIso(visibleMonth, 1);
  const availabilityQuery = useQuery({
    queryKey: ['admin-availability', carId, visibleMonth],
    queryFn: () => getAdminAvailability(carId, visibleMonth, monthEnd),
    enabled: Boolean(carId),
  });

  function invalidateAvailability() {
    queryClient.invalidateQueries({ queryKey: ['admin-availability', carId] });
  }

  const blockMutation = useMutation({
    mutationFn: (input: { from: string; to: string; reason: string; force?: boolean }) =>
      createAvailabilityBlock(carId, input),
    onSuccess: (result) => {
      invalidateAvailability();
      setBlockModalOpen(false);
      if (result.skippedDays.length > 0) {
        pushToast(
          'success',
          `Blocked ${result.blockedDays.length} of ${result.blockedDays.length + result.skippedDays.length} requested days. ${result.skippedDays.length} days were skipped because they're already held.`,
        );
      } else {
        pushToast('success', `Blocked ${result.blockedDays.length} day(s).`);
      }
    },
    onError: (err) => pushToast('danger', errorToastText(err)),
  });

  const unblockMutation = useMutation({
    mutationFn: (blockId: string) => deleteAvailabilityBlock(carId, blockId),
    onSuccess: () => {
      invalidateAvailability();
      setRemoveTarget(null);
      pushToast('success', 'Block removed.');
    },
    onError: (err) => {
      pushToast('danger', errorToastText(err));
      setRemoveTarget(null);
    },
  });

  const blockedDays = new Set(availabilityQuery.data?.blockedDays ?? []);
  const ranges = availabilityQuery.data?.blockedRanges ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-heading-lg text-neutral-900">Calendar</h1>
        <Button variant="primary" disabled={!carId} onClick={() => setBlockModalOpen(true)}>
          + Block dates
        </Button>
      </div>

      <div className="mt-4 max-w-sm">
        <Select label="Car" value={carId} onChange={(e) => setCarId(e.target.value)}>
          <option value="">Select a car…</option>
          {cars.map((car) => (
            <option key={car.id} value={car.id}>
              {car.make} {car.model} {car.year} — {car.registrationNumber}
            </option>
          ))}
        </Select>
      </div>

      {!carId && (
        <div className="mt-6">
          <EmptyState
            title="Pick a car to see its calendar"
            description="Choose a car above to view its booked, buffered, and admin-blocked days."
          />
        </div>
      )}

      {carId && availabilityQuery.isLoading && (
        <div className="mt-6 h-64 animate-pulse rounded-md border border-border bg-surface-card" />
      )}

      {carId && availabilityQuery.isError && (
        <div className="mt-6">
          <EmptyState
            title="Couldn't load this car's availability"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => availabilityQuery.refetch() }}
          />
        </div>
      )}

      {carId && !availabilityQuery.isLoading && !availabilityQuery.isError && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-md border border-border bg-surface-card p-4">
            <AvailabilityCalendar
              visibleMonth={visibleMonth}
              onVisibleMonthChange={setVisibleMonth}
              blockedDays={blockedDays}
              todayIsoValue={todayIso()}
              mode="readonly"
            />
            {/* spec 04 §1.2 — a car with a CONFIRMED/ACTIVE booking is still
                LISTED and still appears in search; it is never hidden here
                for having a rental. This grid only ever greys out days, never
                the car itself. */}
          </div>

          <div className="rounded-md border border-border bg-surface-card p-4">
            <p className="text-body-sm font-semibold text-neutral-900">Blocked ranges this month</p>
            {ranges.length === 0 && <p className="mt-2 text-body-sm text-neutral-500">Nothing blocked this month.</p>}
            <ul className="mt-2 space-y-3">
              {ranges.map((range) => (
                <li key={`${range.from}-${range.to}-${range.source}`} className="text-body-sm">
                  <p className="font-medium text-neutral-900">
                    {range.from} → {range.to}
                  </p>
                  <p className="text-neutral-600">{SOURCE_LABELS[range.source]}</p>
                  {range.reason && <p className="text-neutral-600">"{range.reason}"</p>}
                  {range.source === 'ADMIN_BLOCK' && range.blockId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1"
                      onClick={() => setRemoveTarget(range)}
                    >
                      Remove block
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <BlockDatesModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        onSubmit={(input) => blockMutation.mutate(input)}
        isSubmitting={blockMutation.isPending}
        defaultFrom={visibleMonth}
      />

      <ConfirmReasonModal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget?.blockId && unblockMutation.mutate(removeTarget.blockId)}
        title="Remove this block?"
        description={removeTarget ? `${removeTarget.from} → ${removeTarget.to}, currently blocked for: "${removeTarget.reason ?? ''}"` : undefined}
        reasonLabel="Note (not sent to the server)"
        confirmLabel="Remove block"
        confirmVariant="danger"
        isSubmitting={unblockMutation.isPending}
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

function BlockDatesModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  defaultFrom,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { from: string; to: string; reason: string; force?: boolean }) => void;
  isSubmitting: boolean;
  defaultFrom: string;
}) {
  const DEFAULT_REASON = 'Car is already booked';
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultFrom);
  const [reason, setReason] = useState(DEFAULT_REASON);

  function handleClose() {
    setReason(DEFAULT_REASON);
    onClose();
  }

  const canSubmit = from.length > 0 && to.length > 0 && to > from && reason.trim().length > 0 && !isSubmitting;

  return (
    <Modal open={open} onClose={handleClose} title="Block dates">
      <ModalBody>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>
          <Textarea
            label="Reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Scheduled service — brake pads"
            rows={3}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          isLoading={isSubmitting}
          onClick={() => onSubmit({ from, to, reason: reason.trim() })}
        >
          Block dates
        </Button>
      </ModalFooter>
    </Modal>
  );
}
