import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { ConfirmReasonModal } from '../../components/admin/ConfirmReasonModal';
import { Button, Toast, ToastViewport } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/public/EmptyState';
import { ApiError } from '../../lib/apiClient';
import { adminGetUser, deactivateAdminUser, reactivateAdminUser, type AdminUser } from '../../api/admin';
import { userActiveMeta } from '../../lib/statusMeta';

const ROLE_LABELS: Record<Role, string> = {
  USER: 'User',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

function errorToastText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GUARD_FAILED') return err.message || 'This action cannot be completed right now.';
    if (err.code === 'INVALID_TRANSITION') return 'This account has already changed. Refreshing.';
    if (err.code === 'NOT_FOUND') return 'This user no longer exists.';
    return err.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function AdminUserDetailPage() {
  return (
    <AdminShell>
      <UserDetail />
    </AdminShell>
  );
}

function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const detailQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminGetUser(userId!),
    enabled: Boolean(userId),
  });

  function onMutationSuccess(updated: AdminUser, successText: string) {
    queryClient.setQueryData(['admin-user', userId], updated);
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    pushToast('success', successText);
    setAction(null);
  }

  // spec 05.5 §5.3 — reason is [server-required]. Confirmation modal +
  // mandatory reason, RULE ADM-1.
  const suspendMutation = useMutation({
    mutationFn: (reason: string) => deactivateAdminUser(userId!, reason),
    onSuccess: (updated) => onMutationSuccess(updated, 'Account suspended.'),
    onError: (err) => pushToast('danger', errorToastText(err)),
  });

  // spec 05.5 §5.4 — reason is [server-optional, UI-required per RULE ADM-1].
  // The modal still enforces non-empty text even though the server route
  // accepts no body for this endpoint (see api/admin.ts's reactivateAdminUser).
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateAdminUser(userId!),
    onSuccess: (updated) => onMutationSuccess(updated, 'Account reactivated.'),
    onError: (err) => pushToast('danger', errorToastText(err)),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-sm bg-surface-sunken" />
        <div className="h-40 animate-pulse rounded-md bg-surface-sunken" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <EmptyState
        title="Couldn't load this user"
        description="Something went wrong reaching the server. Please try again shortly."
        action={{ label: 'Retry', onClick: () => detailQuery.refetch() }}
      />
    );
  }

  const user = detailQuery.data;
  if (!user) return null;

  const activeMeta = userActiveMeta(user.isActive);

  return (
    <div>
      <Link to="/admin/users" className="text-body-sm text-brand-accent hover:text-brand-accent-hover">
        ← Back to Users
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-heading-lg text-neutral-900">{user.name}</h1>
          <Badge status={activeMeta.badge}>{activeMeta.label}</Badge>
        </div>
        <div>
          {user.isActive ? (
            <Button variant="danger" onClick={() => setAction('suspend')}>
              Suspend / Ban
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setAction('reactivate')}>
              Reactivate
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-border bg-surface-card p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption uppercase tracking-wide text-neutral-500">Email</dt>
            <dd className="mt-0.5 text-body-md text-neutral-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-neutral-500">Phone</dt>
            <dd className="mt-0.5 text-body-md text-neutral-900">{user.phone}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-neutral-500">Role</dt>
            <dd className="mt-0.5 text-body-md text-neutral-900">{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-neutral-500">Joined</dt>
            <dd className="mt-0.5 text-body-md text-neutral-900">{new Date(user.createdAt).toLocaleDateString('en-IN')}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-neutral-500">Driving licence on file</dt>
            <dd className="mt-0.5 font-mono text-mono-sm text-neutral-900">
              {user.drivingLicence?.number ?? '—'}
            </dd>
            <p className="mt-1 text-body-sm text-neutral-500">
              Self-asserted, not verified — checked against the physical card only at handover.
            </p>
          </div>
        </dl>
      </div>

      <ConfirmReasonModal
        open={action === 'suspend'}
        onClose={() => setAction(null)}
        onConfirm={(reason) => suspendMutation.mutate(reason)}
        title={`Suspend ${user.name}?`}
        description="This user will be logged out everywhere immediately. Their listed cars and confirmed bookings are NOT automatically cancelled — handle those separately if this suspension should affect them."
        reasonLabel="Reason"
        confirmLabel="Suspend account"
        confirmVariant="danger"
        isSubmitting={suspendMutation.isPending}
      />

      <ConfirmReasonModal
        open={action === 'reactivate'}
        onClose={() => setAction(null)}
        onConfirm={() => reactivateMutation.mutate()}
        title={`Reactivate ${user.name}?`}
        description="This does not restore their previous sessions or relist any of their cars — those are separate, deliberate decisions."
        reasonLabel="Note"
        confirmLabel="Reactivate account"
        isSubmitting={reactivateMutation.isPending}
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
