import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { Button, Toast, ToastViewport } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/public/EmptyState';
import { ApiError } from '../../lib/apiClient';
import {
  adminGetListing,
  approveListing,
  delistListing,
  publishListing,
  rejectListing,
  relistListing,
  type AdminCar,
} from '../../api/admin';
import { carModerationMeta, carListingMeta } from '../../lib/statusMeta';

// spec 05.5 §2.3's approval checklist — rendered above the confirm button,
// not merely implied, per the spec's own instruction that this is a human
// judgment call the UI cannot verify on the admin's behalf.
const APPROVE_CHECKLIST = [
  'Photos are of the actual car, not stock images.',
  'The registration number matches the plate visible in the photos.',
  'The price is plausible for this make, model, and year.',
  'The description contains no contact details, external links, or anything indicating a sale.',
];

type ActionKind = 'approve' | 'reject' | 'publish' | 'delist' | 'relist' | null;

export function AdminListingDetailPage() {
  return (
    <AdminShell>
      <ListingDetail />
    </AdminShell>
  );
}

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GUARD_FAILED') return err.message || 'This action cannot be completed right now.';
    if (err.code === 'INVALID_TRANSITION') return 'This record has already changed. Refreshing.';
    if (err.code === 'CONFLICT') return 'This registration number is already claimed by another listing.';
    if (err.code === 'NOT_FOUND') return 'This listing is no longer available.';
    if (err.code === 'VALIDATION_FAILED') return 'Please check the form and try again.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

function ListingDetail() {
  const { carId } = useParams<{ carId: string }>();
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
    queryKey: ['admin-listing', carId],
    queryFn: () => adminGetListing(carId!),
    enabled: Boolean(carId),
  });

  function onMutationSuccess(updated: AdminCar, successText: string) {
    queryClient.setQueryData(['admin-listing', carId], updated);
    queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-counts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-oldest-pending-listing'] });
    pushToast('success', successText);
    setActiveAction(null);
  }

  function onMutationError(err: unknown) {
    // RULE ADM-2 — roll back to server truth rather than trust the optimistic
    // guess: re-fetch so stale availableActions/state don't linger.
    detailQuery.refetch();
    pushToast('danger', errorToastText(err));
  }

  const approveMutation = useMutation({
    mutationFn: () => approveListing(carId!),
    onSuccess: (car) =>
      onMutationSuccess(car, "Approved. This won't appear publicly until you also publish it."),
    onError: onMutationError,
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectListing(carId!, reason),
    onSuccess: (car) => onMutationSuccess(car, 'Listing rejected. The owner will see your reason text.'),
    onError: onMutationError,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishListing(carId!),
    onSuccess: (car) => onMutationSuccess(car, 'Listing is now live and bookable.'),
    onError: onMutationError,
  });

  const delistMutation = useMutation({
    mutationFn: (reason: string) => delistListing(carId!, reason),
    onSuccess: (car) => onMutationSuccess(car, 'Listing delisted.'),
    onError: onMutationError,
  });

  const relistMutation = useMutation({
    mutationFn: () => relistListing(carId!),
    onSuccess: (car) => onMutationSuccess(car, 'Listing relisted and visible again.'),
    onError: onMutationError,
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-sm bg-surface-card" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-md border border-border bg-surface-card" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface-card" />
      </div>
    );
  }

  if (detailQuery.isError) {
    const notFound = detailQuery.error instanceof ApiError && detailQuery.error.code === 'NOT_FOUND';
    return (
      <EmptyState
        title={notFound ? 'This listing no longer exists or is no longer visible' : "Couldn't load this listing"}
        description={notFound ? '' : 'Something went wrong reaching the server. Please try again shortly.'}
        action={{ label: 'Back to queue', onClick: () => navigate('/admin/listings') }}
      />
    );
  }

  const car = detailQuery.data!;
  const modMeta = carModerationMeta(car.moderationStatus);
  const listMeta = carListingMeta(car.listingState);

  const canApprove = car.moderationStatus === 'PENDING_APPROVAL';
  const canReject = car.moderationStatus === 'PENDING_APPROVAL';
  // spec 05.5 §2.6 — "Set availability" maps to listingState, not a stored
  // AVAILABLE_FOR_RENT/ON_HOLD field (deleted by design D2). Publish/relist
  // require moderationStatus = APPROVED (guardModerationApproved).
  const canPublish = car.moderationStatus === 'APPROVED' && car.listingState === 'UNLISTED';
  const canDelist = car.listingState === 'LISTED';
  const canRelist = car.moderationStatus === 'APPROVED' && car.listingState === 'DELISTED';

  return (
    <div>
      <Link to="/admin/listings" className="text-body-sm text-neutral-600 hover:text-brand-accent">
        ← Back to queue
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg text-neutral-900">
            {car.make} {car.model} {car.year}
          </h1>
          <p className="mt-1 font-mono text-mono-sm text-neutral-500">Car #{car.id.slice(-8)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge status={modMeta.badge}>{modMeta.label}</Badge>
          <Badge status={listMeta.badge}>{listMeta.label}</Badge>
        </div>
      </div>

      {car.images.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {car.images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`${car.make} ${car.model} photo ${i + 1}`}
              className="h-36 w-full rounded-md border border-border object-cover"
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-body-sm text-neutral-500">No photos on this listing.</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm sm:grid-cols-3">
            <Detail label="Transmission" value={car.transmission} />
            <Detail label="Fuel" value={car.fuelType} />
            <Detail label="Seats" value={String(car.seats)} />
            <Detail label="Mileage" value={`${car.mileageKm.toLocaleString('en-IN')} km`} />
            <Detail label="Registration" value={car.registrationNumber} mono />
            <Detail label="Location" value={`${car.location.city}, ${car.location.state}`} />
            <Detail label="Price/day" value={`₹${car.rentalPricePerDay.toLocaleString('en-IN')}`} />
            {car.rentalPricePerWeek && (
              <Detail label="Price/week" value={`₹${car.rentalPricePerWeek.toLocaleString('en-IN')}`} />
            )}
            {car.depositAmount !== undefined && (
              <Detail label="Deposit" value={`₹${car.depositAmount.toLocaleString('en-IN')}`} />
            )}
          </dl>

          {car.description && (
            <div className="mt-4">
              <p className="text-body-sm font-medium text-neutral-700">Description</p>
              <p className="mt-1 text-body-sm text-neutral-600">{car.description}</p>
            </div>
          )}

          {car.moderationStatus === 'REJECTED' && car.rejectionReason && (
            <p className="mt-4 rounded-sm bg-status-danger-bg px-3 py-2 text-body-sm text-status-danger-fg">
              Rejection reason: "{car.rejectionReason}"
            </p>
          )}
          {car.listingState === 'DELISTED' && car.delistedReason && (
            <p className="mt-2 rounded-sm bg-status-inactive-bg px-3 py-2 text-body-sm text-status-inactive-fg">
              Delisted: "{car.delistedReason}"
            </p>
          )}

          {/* spec 05.5 §2.7 — flag/feature are proposed-only (E-91–E-94,
              OPEN QUESTION ADM-OQ-8): no field, endpoint, or guard for either
              exists anywhere in specs 01–04, and none is implemented
              server-side yet. Per CLAUDE.md ("never implement beyond the
              current task" / "never modify specs while implementing"), this
              pass does not wire buttons to endpoints that don't exist — that
              needs a spec 01/02 amendment first, tracked at ADM-OQ-8. */}
        </div>

        <div>
          <div className="rounded-md border border-border bg-surface-card p-4">
            <p className="text-body-sm font-semibold text-neutral-900">Owner</p>
            <p className="mt-2 text-body-sm text-neutral-800">{car.owner.name}</p>
            <p className="text-body-sm text-neutral-600">{car.owner.email}</p>
            <p className="text-body-sm text-neutral-600">{car.owner.phone}</p>
          </div>

          <div className="mt-4 space-y-2">
            {canApprove && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('approve')}>
                Approve
              </Button>
            )}
            {canReject && (
              <Button variant="danger" className="w-full" onClick={() => setActiveAction('reject')}>
                Reject with reason
              </Button>
            )}
            {canPublish && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('publish')}>
                Publish (make available for rent)
              </Button>
            )}
            {canDelist && (
              <Button variant="secondary" className="w-full" onClick={() => setActiveAction('delist')}>
                Delist (put on hold)
              </Button>
            )}
            {canRelist && (
              <Button variant="primary" className="w-full" onClick={() => setActiveAction('relist')}>
                Relist (make available again)
              </Button>
            )}
            {!canApprove && !canReject && !canPublish && !canDelist && !canRelist && (
              <p className="text-body-sm text-neutral-500">No actions available for this listing's current state.</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmReasonModal
        open={activeAction === 'approve'}
        onClose={() => setActiveAction(null)}
        onConfirm={() => approveMutation.mutate()}
        title="Approve this listing?"
        description="This approves the listing's content. It will not appear publicly until you also Publish it."
        checklist={APPROVE_CHECKLIST}
        reasonLabel="Note (not shown to the owner)"
        confirmLabel="Approve"
        isSubmitting={approveMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'reject'}
        onClose={() => setActiveAction(null)}
        onConfirm={(reason) => rejectMutation.mutate(reason)}
        title="Reject this listing?"
        description="The owner will see your reason text, not your name."
        reasonLabel="Reason"
        confirmLabel="Reject listing"
        confirmVariant="danger"
        isSubmitting={rejectMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'publish'}
        onClose={() => setActiveAction(null)}
        onConfirm={() => publishMutation.mutate()}
        title="Publish this listing?"
        description="This makes the listing visible and bookable to renters immediately."
        reasonLabel="Note"
        confirmLabel="Publish"
        isSubmitting={publishMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'delist'}
        onClose={() => setActiveAction(null)}
        onConfirm={(reason) => delistMutation.mutate(reason)}
        title="Delist this listing?"
        description="The car stays approved but is no longer visible or bookable until relisted."
        reasonLabel="Reason"
        confirmLabel="Delist"
        confirmVariant="danger"
        isSubmitting={delistMutation.isPending}
      />

      <ConfirmReasonModal
        open={activeAction === 'relist'}
        onClose={() => setActiveAction(null)}
        onConfirm={() => relistMutation.mutate()}
        title="Relist this listing?"
        description="This makes the listing visible and bookable to renters again."
        reasonLabel="Note"
        confirmLabel="Relist"
        isSubmitting={relistMutation.isPending}
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
