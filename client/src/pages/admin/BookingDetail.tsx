import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod, PaymentPurpose } from '@rango/shared';
import { PAYMENT_METHODS } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { Button, Input, Select, Textarea, Toast, ToastViewport } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/public/EmptyState';
import { ApiError } from '../../lib/apiClient';
import {
  adminGetBooking,
  cancelBooking,
  confirmBooking,
  confirmOfflinePayment,
  markBookingActive,
  markBookingReturned,
  markNoShow,
  rejectBooking,
  type AdminBookingDetail,
} from '../../api/admin';
import { bookingStatusMeta } from '../../lib/statusMeta';
import { todayIso } from '../../lib/dateUtc';

type ActionKind = 'confirm' | 'reject' | 'cancel' | 'payment' | 'activate' | 'complete' | 'noShow' | null;

export function AdminBookingDetailPage() {
  return (
    <AdminShell>
      <BookingDetail />
    </AdminShell>
  );
}

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

// spec 05.5 §0.3's named-guard copy table, extended with the guard names
// server/src/transitions/guards/booking.guards.ts actually uses.
const GUARD_MESSAGES: Record<string, string> = {
  guardCarStillBookable: "This car is no longer publicly listed — it can't be confirmed onto.",
  guardNoOverlappingRentalAnyCar: 'This renter already holds a confirmed or active rental during these dates.',
  guardPaymentCovered: 'The full amount has not been received yet. Add an override reason to activate anyway.',
  guardStartDateReached: "This rental doesn't start until its start date — handover can't happen early.",
  guardRenterActive: "This renter's account has been deactivated since this booking was confirmed.",
  guardOdometerNotDecreasing: "Odometer-in can't be less than odometer-out.",
  guardStartDatePassed: "This booking's start date hasn't passed yet — a no-show can't be declared before then.",
  guardStatusCancellable: 'This rental is already active — cancel is not available; it must be completed instead.',
  guardBookingExpectsPayment: "This booking's status doesn't accept a payment right now.",
  guardNotOverpaying: 'This amount would exceed what is owed for this purpose.',
};

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GUARD_FAILED') {
      const guard = (err.details as { guard?: string } | undefined)?.guard;
      if (guard && GUARD_MESSAGES[guard]) return GUARD_MESSAGES[guard];
      return err.message || 'This action cannot be completed right now.';
    }
    if (err.code === 'INVALID_TRANSITION') return 'This record has already changed. Refreshing.';
    if (err.code === 'NOT_FOUND') return 'This booking is no longer available.';
    if (err.code === 'VALIDATION_FAILED') return 'Please check the form and try again.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

function BookingDetail() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActionKind>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const detailQuery = useQuery({
    queryKey: ['admin-booking', bookingId],
    queryFn: () => adminGetBooking(bookingId!),
    enabled: Boolean(bookingId),
  });

  function onMutationSuccess(updated: AdminBookingDetail, successText: string) {
    queryClient.setQueryData(['admin-booking', bookingId], updated);
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-counts'] });
    pushToast('success', successText);
    setActiveAction(null);
  }

  // RULE ADM-2 (spec 05.5 §0.5) — the status change is applied to the cache
  // immediately, before the response returns, and rolled back to the
  // pre-action snapshot on error.
  function onMutate(patch: Partial<AdminBookingDetail>) {
    const previous = queryClient.getQueryData<AdminBookingDetail>(['admin-booking', bookingId]);
    if (previous) queryClient.setQueryData<AdminBookingDetail>(['admin-booking', bookingId], { ...previous, ...patch });
    return { previous };
  }

  function onMutationError(err: unknown, _vars: unknown, context: unknown) {
    const previous = (context as { previous?: AdminBookingDetail } | undefined)?.previous;
    if (previous) queryClient.setQueryData(['admin-booking', bookingId], previous);
    else detailQuery.refetch();
    pushToast('danger', errorToastText(err));
  }

  const confirmMutation = useMutation({
    mutationFn: () => confirmBooking(bookingId!),
    onMutate: () => onMutate({ status: 'CONFIRMED' }),
    onSuccess: (b) =>
      onMutationSuccess(b, "Confirmed. Both parties can now see each other's phone number."),
    onError: onMutationError,
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectBooking(bookingId!, reason),
    onMutate: () => onMutate({ status: 'REJECTED' }),
    onSuccess: (b) => onMutationSuccess(b, 'Booking request rejected.'),
    onError: onMutationError,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelBooking(bookingId!, reason),
    onMutate: () => onMutate({ status: 'CANCELLED' }),
    onSuccess: (b) => onMutationSuccess(b, 'Booking cancelled.'),
    onError: onMutationError,
  });

  const noShowMutation = useMutation({
    mutationFn: (reason: string) => markNoShow(bookingId!, reason),
    onMutate: () => onMutate({ status: 'NO_SHOW' }),
    onSuccess: (b) => onMutationSuccess(b, 'Marked as a no-show. New requests from this renter are blocked until cleared.'),
    onError: onMutationError,
  });

  const paymentMutation = useMutation({
    mutationFn: (input: { amount: number; paymentMethod: PaymentMethod; purpose: PaymentPurpose; referenceNote?: string }) =>
      confirmOfflinePayment(bookingId!, input),
    onSuccess: ({ booking }) => onMutationSuccess(booking, 'Payment recorded and settled.'),
    onError: onMutationError,
  });

  const activateMutation = useMutation({
    mutationFn: (input: { odometerOut?: number; overrideReason?: string }) => markBookingActive(bookingId!, input),
    onSuccess: (b) => onMutationSuccess(b, 'Handover complete. The rental is now active.'),
    onError: onMutationError,
  });

  const completeMutation = useMutation({
    mutationFn: (input: { odometerIn?: number; conditionNote?: string }) => markBookingReturned(bookingId!, input),
    onSuccess: (b) => onMutationSuccess(b, 'Rental completed.'),
    onError: onMutationError,
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-sm bg-surface-card" />
        <div className="h-40 animate-pulse rounded-md border border-border bg-surface-card" />
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface-card" />
      </div>
    );
  }

  if (detailQuery.isError) {
    const notFound = detailQuery.error instanceof ApiError && detailQuery.error.code === 'NOT_FOUND';
    return (
      <EmptyState
        title={notFound ? 'This booking no longer exists' : "Couldn't load this booking"}
        description={notFound ? '' : 'Something went wrong reaching the server. Please try again shortly.'}
        action={{ label: 'Back to queue', onClick: () => navigate('/admin/bookings') }}
      />
    );
  }

  const booking = detailQuery.data!;
  const meta = bookingStatusMeta(booking.status);
  const shortfall = booking.totalAmount - booking.amountReceived;
  const depositShortfall = booking.depositSnapshot - booking.depositReceived;
  const startDatePassed = booking.startDate.slice(0, 10) < todayIso();

  const canConfirm = booking.status === 'REQUESTED';
  const canReject = booking.status === 'REQUESTED';
  const canCancel = booking.status === 'REQUESTED' || booking.status === 'CONFIRMED';
  const canRecordPayment = !['REQUESTED', 'REJECTED', 'CANCELLED'].includes(booking.status);
  const canActivate = booking.status === 'CONFIRMED';
  const canComplete = booking.status === 'ACTIVE';
  const canMarkNoShow = booking.status === 'CONFIRMED';
  const noActionsAvailable =
    !canConfirm && !canReject && !canCancel && !canRecordPayment && !canActivate && !canComplete && !canMarkNoShow;

  return (
    <div>
      <Link to="/admin/bookings" className="text-body-sm text-neutral-600 hover:text-brand-accent">
        ← Back to queue
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg text-neutral-900">
            {booking.car.make} {booking.car.model}
          </h1>
          <p className="mt-1 font-mono text-mono-sm text-neutral-500">Booking #{booking._id.slice(-8)}</p>
        </div>
        <Badge status={meta.badge}>{meta.label}</Badge>
      </div>
      <p className="mt-1 text-body-sm text-neutral-600">{meta.explain}</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-md border border-border bg-surface-card p-4">
            <p className="text-body-sm font-semibold text-neutral-900">Car &amp; dates</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm sm:grid-cols-3">
              <Detail label="Car" value={`${booking.car.make} ${booking.car.model}`} />
              <Detail label="Registration" value={booking.car.registrationNumber} mono />
              <Detail
                label="Dates"
                value={`${new Date(booking.startDate).toLocaleDateString('en-IN')} → ${new Date(booking.endDate).toLocaleDateString('en-IN')} (${booking.days}d)`}
              />
              <Detail label="Rate/day" value={`₹${booking.ratePerDaySnapshot.toLocaleString('en-IN')}`} />
              <Detail label="Total" value={`₹${booking.totalAmount.toLocaleString('en-IN')}`} />
              <Detail label="Requested" value={new Date(booking.createdAt).toLocaleString('en-IN')} />
            </dl>
          </div>

          <div className="rounded-md border border-border bg-surface-card p-4">
            <p className="text-body-sm font-semibold text-neutral-900">Money</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm sm:grid-cols-3">
              <Detail
                label="Rental received"
                value={`₹${booking.amountReceived.toLocaleString('en-IN')} / ₹${booking.totalAmount.toLocaleString('en-IN')}${shortfall <= 0 ? ' ✓' : ''}`}
              />
              <Detail
                label="Deposit received"
                value={`₹${booking.depositReceived.toLocaleString('en-IN')} / ₹${booking.depositSnapshot.toLocaleString('en-IN')}${depositShortfall > 0 ? ' ⚠' : ''}`}
              />
              {booking.odometerOut !== undefined && <Detail label="Odometer (out)" value={`${booking.odometerOut} km`} />}
              {booking.odometerIn !== undefined && <Detail label="Odometer (in)" value={`${booking.odometerIn} km`} />}
            </dl>
            {booking.payments.length > 0 && (
              <div className="mt-4">
                <p className="text-caption font-medium uppercase tracking-wide text-neutral-500">Payment history</p>
                <ul className="mt-2 space-y-1">
                  {booking.payments.map((p) => (
                    <li key={p._id} className="text-body-sm text-neutral-700">
                      {p.direction === 'IN' ? '+' : '−'}₹{p.amount.toLocaleString('en-IN')} · {p.purpose} · {p.paymentMethod} ·{' '}
                      {p.status}
                      {p.referenceNote ? ` · "${p.referenceNote}"` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {booking.rejectionReason && (
            <p className="rounded-sm bg-status-danger-bg px-3 py-2 text-body-sm text-status-danger-fg">
              Rejection reason: "{booking.rejectionReason}"
            </p>
          )}
          {booking.cancellationReason && (
            <p className="rounded-sm bg-status-danger-bg px-3 py-2 text-body-sm text-status-danger-fg">
              Cancellation reason: "{booking.cancellationReason}"
            </p>
          )}
          {booking.noShowReason && (
            <p className="rounded-sm bg-status-warning-bg px-3 py-2 text-body-sm text-status-warning-fg">
              No-show note: "{booking.noShowReason}"
            </p>
          )}
        </div>

        <div className="space-y-4">
          {/* spec 04 §4.1 RULE CR-1 — an admin sees both parties' contact in
              full, always, in every status; there is no separate "reveal"
              action. */}
          <PartyCard title="Renter" party={booking.renter} />
          <PartyCard title="Owner" party={booking.owner} />

          <div className="space-y-2">
            {canConfirm && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('confirm')}>
                Confirm booking
              </Button>
            )}
            {canReject && (
              <Button variant="danger" className="w-full" onClick={() => setActiveAction('reject')}>
                Reject with reason
              </Button>
            )}
            {canRecordPayment && (
              <Button variant="secondary" className="w-full" onClick={() => setActiveAction('payment')}>
                Record offline payment received
              </Button>
            )}
            {canActivate && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('activate')}>
                Mark active (handover)
              </Button>
            )}
            {canComplete && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('complete')}>
                Mark returned
              </Button>
            )}
            {canMarkNoShow && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setActiveAction('noShow')}
                disabled={!startDatePassed}
                title={!startDatePassed ? "This booking's start date hasn't passed yet" : undefined}
              >
                Mark no-show
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" className="w-full" onClick={() => setActiveAction('cancel')}>
                Cancel booking
              </Button>
            )}
            {noActionsAvailable && (
              <p className="text-body-sm text-neutral-500">No actions available for this booking's current state.</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmReasonModal
        open={activeAction === 'confirm'}
        onClose={() => setActiveAction(null)}
        onConfirm={() => confirmMutation.mutate()}
        title="Confirm this booking?"
        description="Confirming will reveal both parties' phone numbers to each other. Make sure the owner has agreed the car is free and the renter has been reached before confirming."
        reasonLabel="Note (not sent anywhere yet)"
        confirmLabel="Confirm booking"
        isSubmitting={confirmMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'reject'}
        onClose={() => setActiveAction(null)}
        onConfirm={(reason) => rejectMutation.mutate(reason)}
        title="Reject this booking request?"
        reasonLabel="Reason"
        confirmLabel="Reject request"
        confirmVariant="danger"
        isSubmitting={rejectMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'cancel'}
        onClose={() => setActiveAction(null)}
        onConfirm={(reason) => cancelMutation.mutate(reason)}
        title="Cancel this booking?"
        description={
          booking.status === 'CONFIRMED' && booking.amountReceived > 0
            ? `This booking has ₹${booking.amountReceived.toLocaleString('en-IN')} recorded as received. Cancelling does not refund it automatically — record a refund separately if needed.`
            : undefined
        }
        reasonLabel="Reason"
        confirmLabel="Cancel booking"
        confirmVariant="danger"
        isSubmitting={cancelMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'noShow'}
        onClose={() => setActiveAction(null)}
        onConfirm={(reason) => noShowMutation.mutate(reason)}
        title="Mark this booking as a no-show?"
        description={`This will block ${booking.renter.name} from making new booking requests until an admin clears this strike.`}
        reasonLabel="Reason"
        confirmLabel="Mark no-show"
        confirmVariant="danger"
        isSubmitting={noShowMutation.isPending}
      />

      <RecordPaymentModal
        open={activeAction === 'payment'}
        onClose={() => setActiveAction(null)}
        onSubmit={(input) => paymentMutation.mutate(input)}
        isSubmitting={paymentMutation.isPending}
        rentalOwed={Math.max(0, shortfall)}
        depositOwed={Math.max(0, depositShortfall)}
      />

      <ActivateBookingModal
        open={activeAction === 'activate'}
        onClose={() => setActiveAction(null)}
        onSubmit={(input) => activateMutation.mutate(input)}
        isSubmitting={activateMutation.isPending}
        licenceOnFile={booking.renter.drivingLicence?.number}
        shortfall={shortfall}
        totalAmount={booking.totalAmount}
        amountReceived={booking.amountReceived}
      />

      <CompleteBookingModal
        open={activeAction === 'complete'}
        onClose={() => setActiveAction(null)}
        onSubmit={(input) => completeMutation.mutate(input)}
        isSubmitting={completeMutation.isPending}
        odometerOut={booking.odometerOut}
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

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={mono ? 'font-mono text-mono-sm text-neutral-900' : 'text-neutral-900'}>{value}</dd>
    </div>
  );
}

function PartyCard({ title, party }: { title: string; party: { name: string; email: string; phone: string } }) {
  return (
    <div className="rounded-md border border-border bg-surface-card p-4">
      <p className="text-body-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 text-body-sm text-neutral-800">{party.name}</p>
      <p className="text-body-sm text-neutral-600">{party.email}</p>
      <p className="text-body-sm text-neutral-600">{party.phone}</p>
    </div>
  );
}

// Custom modals below reuse the shared Modal/ModalBody/ModalFooter primitive
// (the same one ConfirmReasonModal is built from) rather than reimplementing
// dialog chrome — these actions need extra numeric/select fields
// ConfirmReasonModal's single-textarea shape can't carry.

function RecordPaymentModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  rentalOwed,
  depositOwed,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; paymentMethod: PaymentMethod; purpose: PaymentPurpose; referenceNote?: string }) => void;
  isSubmitting: boolean;
  rentalOwed: number;
  depositOwed: number;
}) {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState<PaymentPurpose>('RENTAL');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [referenceNote, setReferenceNote] = useState('');

  function handleClose() {
    setAmount('');
    setPurpose('RENTAL');
    setPaymentMethod('CASH');
    setReferenceNote('');
    onClose();
  }

  const amountNumber = Number(amount);
  const canSubmit = amount.trim().length > 0 && amountNumber > 0 && !isSubmitting;

  return (
    <Modal open={open} onClose={handleClose} title="Record offline payment">
      <ModalBody>
        {/* spec 05.5 §3.2 — this form is its own confirmation step (RULE
            ADM-1's blanket modal is deliberately not stacked on top of it),
            and this action is NOT optimistic: a double-submitted cash entry
            can let an unpaid car out (spec 02 §2.5). */}
        <p className="text-body-sm text-neutral-600">
          Rental owed: ₹{rentalOwed.toLocaleString('en-IN')} · Deposit owed: ₹{depositOwed.toLocaleString('en-IN')}
        </p>
        <div className="mt-4 space-y-3">
          <Input
            label="Amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
          <Select label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as PaymentPurpose)}>
            <option value="RENTAL">Rental</option>
            <option value="DEPOSIT">Deposit</option>
          </Select>
          <Select label="Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <Input
            label="Reference (optional)"
            placeholder="e.g. UPI txn id"
            value={referenceNote}
            onChange={(e) => setReferenceNote(e.target.value)}
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
          onClick={() =>
            onSubmit({
              amount: amountNumber,
              paymentMethod,
              purpose,
              ...(referenceNote.trim() ? { referenceNote: referenceNote.trim() } : {}),
            })
          }
        >
          Record payment
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ActivateBookingModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  licenceOnFile,
  shortfall,
  totalAmount,
  amountReceived,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { odometerOut?: number; overrideReason?: string }) => void;
  isSubmitting: boolean;
  licenceOnFile?: string | undefined;
  shortfall: number;
  totalAmount: number;
  amountReceived: number;
}) {
  const [odometerOut, setOdometerOut] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  function handleClose() {
    setOdometerOut('');
    setOverrideReason('');
    onClose();
  }

  const needsOverride = shortfall > 0;
  const canSubmit = (!needsOverride || overrideReason.trim().length > 0) && !isSubmitting;

  return (
    <Modal open={open} onClose={handleClose} title="Handover — mark active">
      <ModalBody>
        {/* spec 04 §7 — physical identity check happens off-screen, in
            person; the on-file licence number is shown here purely so the
            admin can compare it against the physical card. Nothing about
            the check itself is submitted — server/src/models/Booking.model.ts
            defines an `identityCheck` field, but no route currently writes
            it, so this form cannot claim to record a pass/fail without
            lying about what happens server-side. */}
        {licenceOnFile && (
          <p className="text-body-sm text-neutral-600">
            On file: <span className="font-mono text-mono-sm">{licenceOnFile}</span> — compare against the physical
            licence in person before proceeding.
          </p>
        )}
        <p className="mt-2 text-body-sm text-neutral-600">
          Amount received: ₹{amountReceived.toLocaleString('en-IN')} / ₹{totalAmount.toLocaleString('en-IN')}
          {shortfall <= 0 ? ' ✓' : ''}
        </p>
        <div className="mt-4 space-y-3">
          <Input
            label="Odometer (out)"
            type="number"
            min={0}
            value={odometerOut}
            onChange={(e) => setOdometerOut(e.target.value)}
          />
          {needsOverride && (
            <Textarea
              label="Override reason (required — payment shortfall)"
              required
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              helperText={`Shortfall: ₹${shortfall.toLocaleString('en-IN')}`}
              rows={3}
            />
          )}
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
          onClick={() =>
            onSubmit({
              ...(odometerOut.trim() ? { odometerOut: Number(odometerOut) } : {}),
              ...(needsOverride ? { overrideReason: overrideReason.trim() } : {}),
            })
          }
        >
          Confirm handover
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CompleteBookingModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  odometerOut,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { odometerIn?: number; conditionNote?: string }) => void;
  isSubmitting: boolean;
  odometerOut?: number | undefined;
}) {
  const [odometerIn, setOdometerIn] = useState('');
  const [conditionNote, setConditionNote] = useState('');

  function handleClose() {
    setOdometerIn('');
    setConditionNote('');
    onClose();
  }

  const odometerInNumber = odometerIn.trim() ? Number(odometerIn) : undefined;
  const odometerInvalid =
    odometerInNumber !== undefined && odometerOut !== undefined && odometerInNumber < odometerOut;
  const canSubmit = !odometerInvalid && !isSubmitting;

  return (
    <Modal open={open} onClose={handleClose} title="Complete rental — mark returned">
      <ModalBody>
        <div className="space-y-3">
          <Input
            label="Odometer (in)"
            type="number"
            min={odometerOut ?? 0}
            value={odometerIn}
            onChange={(e) => setOdometerIn(e.target.value)}
            errorText={odometerInvalid ? `Can't be less than odometer-out (${odometerOut} km)` : undefined}
            helperText={odometerOut !== undefined ? `Out was ${odometerOut} km` : undefined}
          />
          <Textarea
            label="Condition notes (optional)"
            value={conditionNote}
            onChange={(e) => setConditionNote(e.target.value)}
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
          onClick={() =>
            onSubmit({
              ...(odometerInNumber !== undefined ? { odometerIn: odometerInNumber } : {}),
              ...(conditionNote.trim() ? { conditionNote: conditionNote.trim() } : {}),
            })
          }
        >
          Complete rental
        </Button>
      </ModalFooter>
    </Modal>
  );
}
