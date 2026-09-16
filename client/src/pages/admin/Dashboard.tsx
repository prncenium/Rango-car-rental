import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminShell } from '../../components/admin/AdminShell';
import { EmptyState } from '../../components/public/EmptyState';
import { getAuditLog, getDashboardCounts, adminListListings } from '../../api/admin';
import { AlertTriangleIcon } from '../../components/ui/icons';

export function AdminDashboardPage() {
  return (
    <AdminShell>
      <Dashboard />
    </AdminShell>
  );
}

function todayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function Dashboard() {
  const countsQuery = useQuery({
    queryKey: ['admin-dashboard-counts'],
    queryFn: getDashboardCounts,
    refetchInterval: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: ['admin-audit-today'],
    queryFn: () => getAuditLog({ createdAtFrom: todayStartIso(), limit: 20 }),
  });

  // Quick-action queue (spec 05.5 §1.4) — the oldest pending listing only.
  // Booking-sourced rows (oldest REQUESTED booking, same-day handovers, open
  // cancellation requests) are out of scope for this pass — no admin booking
  // UI exists yet to act on them from (per CLAUDE.md: "never implement
  // beyond the current task"); their counts still render as read-only tiles
  // below so the queues are not invisible, just not yet actionable here.
  //
  // GAP: E-27/ADM-03's sort whitelist (server/src/routes/admin.car.routes.ts)
  // has no `createdAt:asc`, only `createdAt:desc` — so true FIFO ("oldest
  // first", spec 05.5 §0.7) isn't directly requestable. This fetches the
  // newest 100 pending listings and takes the *last* one as an approximation
  // of "oldest", which is exact as long as the pending queue is under 100
  // rows. Flagging rather than silently sorting client-side over an
  // unbounded fetch, or adding a sort value the server doesn't define.
  const oldestPendingQuery = useQuery({
    queryKey: ['admin-oldest-pending-listing'],
    queryFn: () => adminListListings({ moderationStatus: ['PENDING_APPROVAL'], sort: 'createdAt:desc', limit: 100 }),
    select: (result) => {
      const oldest = result.data.at(-1);
      return oldest ? [oldest] : [];
    },
  });

  const counts = countsQuery.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-heading-lg text-neutral-900">Dashboard</h1>
        {countsQuery.isFetching && <span className="text-caption text-neutral-500">Refreshing…</span>}
      </div>

      <section className="mt-6" aria-label="Queues">
        {countsQuery.isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-md border border-border bg-surface-card" />
            ))}
          </div>
        )}

        {countsQuery.isError && (
          <EmptyState
            title="Couldn't load dashboard counts"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => countsQuery.refetch() }}
          />
        )}

        {counts && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <QueueTile
              label="Listings pending"
              count={counts.queues.listingsPending}
              linkTo="/admin/listings?moderationStatus=PENDING_APPROVAL"
              linkLabel="Review"
            />
            <QueueTile label="Bookings requested" count={counts.queues.bookingsRequested} />
            <QueueTile label="Awaiting payment confirmation" count={counts.queues.bookingsAwaitingPayment} />
            <QueueTile label="Awaiting handover" count={counts.queues.bookingsAwaitingHandover} />
            <QueueTile label="Cancellation requests open" count={counts.cancellationRequestsOpen} />
            <QueueTile label="Overdue returns" count={counts.operations.returnsOverdue} severe />
          </div>
        )}
      </section>

      <section className="mt-10" aria-label="Today's activity">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-heading-sm text-neutral-900">Today's activity</h2>
          <Link to="/admin/audit" className="text-body-sm font-medium text-brand-accent hover:text-brand-accent-hover">
            Audit log →
          </Link>
        </div>
        <div className="mt-3">
          {activityQuery.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-none border-b border-border bg-surface-card" />
              ))}
            </div>
          )}
          {activityQuery.isError && (
            <p className="text-body-sm text-neutral-500">Couldn't load today's activity.</p>
          )}
          {activityQuery.data && activityQuery.data.data.length === 0 && (
            <p className="text-body-sm text-neutral-500">No activity yet today.</p>
          )}
          {activityQuery.data && activityQuery.data.data.length > 0 && (
            <ul className="divide-y divide-border rounded-none border border-border bg-surface-card">
              {activityQuery.data.data.map((entry) => (
                <li key={entry._id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-body-sm">
                  <span className="font-mono text-mono-sm text-neutral-500">
                    {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-neutral-700">{typeof entry.actor === 'string' ? entry.actor : entry.actor.name}</span>
                  <span className="font-medium text-neutral-900">{entry.action}</span>
                  <span className="text-neutral-500">
                    {entry.entityType} #{entry.entityId.slice(-6)}
                  </span>
                  {entry.previousState && entry.newState && (
                    <span className="text-neutral-500">
                      {entry.previousState} → {entry.newState}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10" aria-label="Quick-action queue">
        <h2 className="font-display text-heading-sm text-neutral-900">Quick-action queue</h2>
        <div className="mt-3">
          {oldestPendingQuery.isLoading && (
            <div className="h-16 animate-pulse rounded-md border border-border bg-surface-card" />
          )}
          {oldestPendingQuery.data && oldestPendingQuery.data.length === 0 && (
            <p className="text-body-sm text-neutral-500">Nothing needs your attention right now.</p>
          )}
          {oldestPendingQuery.data && oldestPendingQuery.data.length > 0 && (
            <ul className="space-y-2">
              {oldestPendingQuery.data.map((car) => (
                <li
                  key={car.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-card px-4 py-3"
                >
                  <div>
                    <p className="text-body-sm font-medium text-neutral-900">
                      {car.make} {car.model} {car.year}
                    </p>
                    <p className="text-caption text-neutral-500">Submitted {new Date(car.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <Link to={`/admin/listings/${car.id}`}>
                    <span className="text-body-sm font-medium text-brand-accent hover:text-brand-accent-hover">
                      Review →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function QueueTile({
  label,
  count,
  linkTo,
  linkLabel,
  severe,
}: {
  label: string;
  count: number;
  linkTo?: string;
  linkLabel?: string;
  severe?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-card p-4">
      <p className="text-body-sm text-neutral-600">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-display text-heading-lg text-neutral-900">{count}</span>
        {severe && count > 0 && <AlertTriangleIcon className="h-4 w-4 text-status-warning-fg" />}
      </div>
      {count === 0 && <p className="mt-1 text-caption text-neutral-400">All clear</p>}
      {linkTo && (
        <Link to={linkTo} className="mt-2 inline-block text-body-sm font-medium text-brand-accent hover:text-brand-accent-hover">
          {linkLabel ?? 'Review'} →
        </Link>
      )}
    </div>
  );
}
