import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Role } from '@rango/shared';
import { ROLES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { EmptyState } from '../../components/public/EmptyState';
import { Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Input, Button } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { adminListUsers } from '../../api/admin';
import { userActiveMeta } from '../../lib/statusMeta';

const ROLE_LABELS: Record<Role, string> = {
  USER: 'User',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

// spec 05.5 §5.1 — user list, search, filter. Queue-first, no separate
// landing page (spec 05.5 §0.7's information-architecture rule).
export function AdminUsersPage() {
  return (
    <AdminShell>
      <UsersList />
    </AdminShell>
  );
}

function UsersList() {
  const [role, setRole] = useState<Role | ''>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const queryKey = ['admin-users', role, isActive, q, page] as const;

  const query = useQuery({
    queryKey,
    queryFn: () =>
      adminListUsers({
        role: role ? [role] : undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
        q: q || undefined,
        sort: 'createdAt:desc',
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const users = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtersActive = role !== '' || isActive !== '' || q !== '';

  function resetFilters() {
    setRole('');
    setIsActive('');
    setQ('');
    setPage(1);
  }

  return (
    <div>
      <h1 className="font-display text-heading-lg text-neutral-900">Users</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role | '');
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={isActive}
          onChange={(e) => {
            setIsActive(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">Any</option>
          <option value="true">Active</option>
          <option value="false">Suspended</option>
        </Select>
        <div className="w-72">
          <Input
            label="Search"
            placeholder="Name, email, or phone"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
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
            title="Couldn't load users"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        )}

        {!query.isLoading && !query.isError && users.length === 0 && (
          <EmptyState
            title="No users match this search."
            description="Try a different filter or search term."
            action={filtersActive ? { label: 'Clear filters', onClick: resetFilters } : undefined}
          />
        )}

        {!query.isLoading && !query.isError && users.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => {
                const activeMeta = userActiveMeta(user.isActive);
                return (
                  <TableRow key={user._id}>
                    <TableCell>
                      <Link to={`/admin/users/${user._id}`} className="font-medium text-neutral-900 hover:text-brand-accent">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-body-sm text-neutral-600">{user.email}</TableCell>
                    <TableCell className="text-body-sm text-neutral-600">{user.phone}</TableCell>
                    <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                    <TableCell>
                      <Badge status={activeMeta.badge}>{activeMeta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/users/${user._id}`}>
                        <Button variant="secondary" size="sm">
                          View
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
