import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CarListingState, CarModerationStatus } from '@rango/shared';
import { CAR_LISTING_STATES, CAR_MODERATION_STATUSES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
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
import { adminListListings, approveListing, rejectListing, type AdminCar } from '../../api/admin';
import { carModerationMeta, carListingMeta } from '../../lib/statusMeta';
import { Badge } from '../../components/ui/Badge';
import { ApiError } from '../../lib/apiClient';
import { useQueueKeyboardNav } from '../../lib/useQueueKeyboardNav';
import { cn } from '../../components/ui/cn';

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

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GUARD_FAILED') return err.message || 'This action cannot be completed right now.';
    if (err.code === 'INVALID_TRANSITION') return 'Someone else already reviewed this listing.';
    if (err.code === 'NOT_FOUND') return 'This listing is no longer available.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function AdminListingModerationPage() {
  return (
    <AdminShell>
      <ListingModerationQueue />
    </AdminShell>
  );
}

type QueryKey = ['admin-listings', CarModerationStatus | '', CarListingState | '', string, number];

function ListingModerationQueue() {
  const [searchParams] = useSearchParams();
  const [moderationStatus, setModerationStatus] = useState<CarModerationStatus | ''>(
    (searchParams.get('moderationStatus') as CarModerationStatus | null) ?? 'PENDING_APPROVAL',
  );
  const [listingState, setListingState] = useState<CarListingState | ''>('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [rowAction, setRowAction] = useState<{ carId: string; kind: 'approve' | 'reject' } | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ approved: string[]; failed: { car: AdminCar; message: string }[] } | null>(
    null,
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const queryClient = useQueryClient();
  const queryKey: QueryKey = ['admin-listings', moderationStatus, listingState, city, page];

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const query = useQuery({
    queryKey,
    queryFn: () =>
      adminListListings({
        moderationStatus: moderationStatus ? [moderationStatus] : undefined,
        listingState: listingState ? [listingState] : undefined,
        city: city || undefined,
        sort: 'createdAt:desc',
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const listings = query.data?.data ?? [];
  const meta = query.data?.meta;

  function resetFilterState() {
    setPage(1);
    setFocusedIndex(0);
    setSelectedIds(new Set());
  }

  // RULE ADM-2 (spec 05.5 §0.5) — the row leaves the queue optimistically on
  // click, before the response returns, and rolls back to the pre-action
  // snapshot on error.
  type ListingsCache = { data: AdminCar[]; meta: NonNullable<typeof meta> } | undefined;

  function removeRowOptimistically(carId: string): ListingsCache {
    const previous = queryClient.getQueryData<ListingsCache>(queryKey);
    queryClient.setQueryData<ListingsCache>(queryKey, (current) => {
      if (!current) return current;
      return {
        data: current.data.filter((c) => c.id !== carId),
        meta: { ...current.meta, total: Math.max(0, current.meta.total - 1) },
      };
    });
    return previous;
  }

  function rollback(previous: ListingsCache) {
    queryClient.setQueryData<ListingsCache>(queryKey, previous);
  }

  function afterSuccess() {
    queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-counts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-oldest-pending-listing'] });
  }

  const approveMutation = useMutation({
    mutationFn: (carId: string) => approveListing(carId),
    onMutate: (carId: string) => ({ previous: removeRowOptimistically(carId) }),
    onSuccess: () => {
      afterSuccess();
      pushToast('success', "Approved. Won't appear publicly until also published.");
      setRowAction(null);
    },
    onError: (err, _carId, context) => {
      rollback((context as { previous: ListingsCache }).previous);
      pushToast('danger', errorToastText(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ carId, reason }: { carId: string; reason: string }) => rejectListing(carId, reason),
    onMutate: ({ carId }) => ({ previous: removeRowOptimistically(carId) }),
    onSuccess: () => {
      afterSuccess();
      pushToast('success', 'Listing rejected.');
      setRowAction(null);
    },
    onError: (err, _vars, context) => {
      rollback((context as { previous: ListingsCache }).previous);
      pushToast('danger', errorToastText(err));
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (carIds: string[]) => {
      const results = await Promise.allSettled(carIds.map((id) => approveListing(id)));
      const approved: string[] = [];
      const failed: { carId: string; message: string }[] = [];
      results.forEach((r, i) => {
        const carId = carIds[i]!;
        if (r.status === 'fulfilled') approved.push(carId);
        else failed.push({ carId, message: errorToastText(r.reason) });
      });
      return { approved, failed };
    },
    onMutate: async (carIds: string[]) => {
      const previous = queryClient.getQueryData<ListingsCache>(queryKey);
      queryClient.setQueryData<ListingsCache>(queryKey, (current) => {
        if (!current) return current;
        return {
          data: current.data.filter((c) => !carIds.includes(c.id)),
          meta: { ...current.meta, total: Math.max(0, current.meta.total - carIds.length) },
        };
      });
      return { previous };
    },
    onSuccess: ({ approved, failed }, _carIds, context) => {
      afterSuccess();
      // Best-effort, per spec 05.5 §7.1's admin-block precedent: failed items
      // are re-inserted into the queue rather than silently dropped.
      if (failed.length > 0) {
        const previous = (context as { previous: ListingsCache }).previous;
        const failedCars = (previous?.data ?? []).filter((c) => failed.some((f) => f.carId === c.id));
        setBulkResult({
          approved,
          failed: failedCars.map((car) => ({ car, message: failed.find((f) => f.carId === car.id)!.message })),
        });
        queryClient.setQueryData<ListingsCache>(queryKey, (current) => {
          if (!current) return current;
          const existingIds = new Set(current.data.map((c) => c.id));
          const reinserted = failedCars.filter((c) => !existingIds.has(c.id));
          return { data: [...reinserted, ...current.data], meta: { ...current.meta, total: current.meta.total + reinserted.length } };
        });
        pushToast('danger', `${approved.length} approved, ${failed.length} failed.`);
      } else {
        pushToast('success', `${approved.length} listing(s) approved.`);
      }
      setSelectedIds(new Set());
      setBulkApproveOpen(false);
    },
    onError: (err, _carIds, context) => {
      rollback((context as { previous: ListingsCache }).previous);
      pushToast('danger', errorToastText(err));
      setBulkApproveOpen(false);
    },
  });

  useQueueKeyboardNav({
    rowCount: listings.length,
    focusedIndex,
    setFocusedIndex,
    onApprove: (index) => {
      const car = listings[index];
      if (car && car.moderationStatus === 'PENDING_APPROVAL') setRowAction({ carId: car.id, kind: 'approve' });
    },
    onReject: (index) => {
      const car = listings[index];
      if (car && car.moderationStatus === 'PENDING_APPROVAL') setRowAction({ carId: car.id, kind: 'reject' });
    },
    onEscape: () => setRowAction(null),
    enabled: !rowAction && !bulkApproveOpen && !bulkResult,
  });

  const focusedCar = listings[focusedIndex];
  const rowActionCar = rowAction ? listings.find((c) => c.id === rowAction.carId) : undefined;
  const selectableCars = listings.filter((c) => c.moderationStatus === 'PENDING_APPROVAL');
  const allSelectableSelected = selectableCars.length > 0 && selectableCars.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds(allSelectableSelected ? new Set() : new Set(selectableCars.map((c) => c.id)));
  }

  function toggleSelect(carId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(carId)) next.delete(carId);
      else next.add(carId);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-heading-lg text-neutral-900">Listings</h1>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-body-sm text-neutral-600">{selectedIds.size} selected</span>
            <Button variant="primary" size="sm" onClick={() => setBulkApproveOpen(true)}>
              Approve selected ({selectedIds.size})
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="Status"
          value={moderationStatus}
          onChange={(e) => {
            setModerationStatus(e.target.value as CarModerationStatus | '');
            resetFilterState();
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
            resetFilterState();
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
              resetFilterState();
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
                resetFilterState();
              },
            }}
          />
        )}

        {!query.isLoading && !query.isError && listings.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all pending listings on this page"
                    checked={allSelectableSelected}
                    disabled={selectableCars.length === 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded-sm border-border-strong text-brand-accent"
                  />
                </TableHeaderCell>
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
              {listings.map((car, index) => {
                const modMeta = carModerationMeta(car.moderationStatus);
                const listMeta = carListingMeta(car.listingState);
                const pending = car.moderationStatus === 'PENDING_APPROVAL';
                return (
                  <TableRow
                    key={car.id}
                    onClick={() => setFocusedIndex(index)}
                    className={cn(index === focusedIndex && 'bg-surface-sunken ring-1 ring-inset ring-focus-ring')}
                  >
                    <TableCell>
                      {pending && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${car.make} ${car.model}`}
                          checked={selectedIds.has(car.id)}
                          onChange={() => toggleSelect(car.id)}
                          className="h-4 w-4 rounded-sm border-border-strong text-brand-accent"
                        />
                      )}
                    </TableCell>
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
                      <div className="flex items-center gap-1.5">
                        {pending && (
                          <>
                            <Button variant="primary" size="sm" onClick={() => setRowAction({ carId: car.id, kind: 'approve' })}>
                              Approve
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setRowAction({ carId: car.id, kind: 'reject' })}>
                              Reject
                            </Button>
                          </>
                        )}
                        <Link to={`/admin/listings/${car.id}`}>
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
        open={rowAction?.kind === 'approve'}
        onClose={() => setRowAction(null)}
        onConfirm={() => rowAction && approveMutation.mutate(rowAction.carId)}
        title="Approve this listing?"
        description="This approves the listing's content. It will not appear publicly until also published from the listing's detail page."
        reasonLabel="Note (not shown to the owner)"
        confirmLabel="Approve"
        isSubmitting={approveMutation.isPending}
      />

      <ConfirmReasonModal
        open={rowAction?.kind === 'reject'}
        onClose={() => setRowAction(null)}
        onConfirm={(reason) => rowAction && rejectMutation.mutate({ carId: rowAction.carId, reason })}
        title={rowActionCar ? `Reject ${rowActionCar.make} ${rowActionCar.model}?` : 'Reject this listing?'}
        description="The owner will see your reason text, not your name."
        reasonLabel="Reason"
        confirmLabel="Reject listing"
        confirmVariant="danger"
        isSubmitting={rejectMutation.isPending}
      />

      <ConfirmReasonModal
        open={bulkApproveOpen}
        onClose={() => setBulkApproveOpen(false)}
        onConfirm={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
        title={`Approve ${selectedIds.size} listing${selectedIds.size === 1 ? '' : 's'}?`}
        description={listings
          .filter((c) => selectedIds.has(c.id))
          .map((c) => `${c.make} ${c.model} ${c.year}`)
          .join(', ')}
        reasonLabel="Note (optional, applied to all)"
        reasonRequired={false}
        confirmLabel={`Approve all ${selectedIds.size}`}
        isSubmitting={bulkApproveMutation.isPending}
      />

      {bulkResult && bulkResult.failed.length > 0 && (
        <Modal
          open
          onClose={() => setBulkResult(null)}
          title={`✓ ${bulkResult.approved.length} approved · ✗ ${bulkResult.failed.length} failed`}
        >
          <ModalBody>
            <ul className="space-y-1 text-body-sm text-neutral-700">
              {bulkResult.failed.map((f) => (
                <li key={f.car.id}>
                  {f.car.make} {f.car.model} — {f.message}{' '}
                  <Link to={`/admin/listings/${f.car.id}`} className="text-brand-accent hover:text-brand-accent-hover">
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setBulkResult(null)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {focusedCar && (
        <p className="sr-only" aria-live="polite">
          Focused row: {focusedCar.make} {focusedCar.model}
        </p>
      )}

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
