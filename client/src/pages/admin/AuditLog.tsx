import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditAction, AuditEntityType } from '@rango/shared';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@rango/shared';
import { AdminShell } from '../../components/admin/AdminShell';
import { EmptyState } from '../../components/public/EmptyState';
import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../components/ui';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { auditActorDetailLabel, auditActorLabel, getAuditLog, type AuditLogEntry } from '../../api/admin';
import { useQueueKeyboardNav } from '../../lib/useQueueKeyboardNav';
import { cn } from '../../components/ui/cn';

// spec 05.5 §6 — filterable audit log viewer. `GET /api/admin/audit` (ADM-01)
// is the only audit read endpoint this server ships: there is no separate
// `/api/superadmin/audit` (E-73) and `queryAuditLog` applies no role-based
// row scoping (server/src/services/audit.service.ts) — spec 05.5 §6.1's
// "an ADMIN doesn't see privileged USER rows" split is not implemented
// server-side. This page renders identically for both roles rather than
// faking a client-side hide, which the spec itself warns would corrupt
// `meta.total` (§6.1) — flagged here, not silently patched over.
const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  USER: 'User',
  CAR: 'Car',
  BOOKING: 'Booking',
  PAYMENT: 'Payment',
  SESSION: 'Session',
  SYSTEM_CONFIG: 'System config',
};

const REDACTED_METADATA_KEYS = /licenceNumber|license|password/i;

export function AdminAuditLogPage() {
  return (
    <AdminShell>
      <AuditLogViewer />
    </AdminShell>
  );
}

function AuditLogViewer() {
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('');
  const [entityId, setEntityId] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [createdAtFrom, setCreatedAtFrom] = useState('');
  const [createdAtTo, setCreatedAtTo] = useState('');
  const [page, setPage] = useState(1);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);
  const actorInputRef = useRef<HTMLInputElement>(null);

  // guardEntityIdRequiresEntityType (spec 05.5 §6.1) — an entityId filter
  // without a paired entityType 400s server-side; the field is disabled
  // client-side rather than letting that request go out.
  const entityIdUsable = entityType !== '';

  const query = useQuery({
    queryKey: ['admin-audit', entityType, entityIdUsable ? entityId : '', actor, action, createdAtFrom, createdAtTo, page],
    queryFn: () =>
      getAuditLog({
        entityType: entityType || undefined,
        entityId: entityIdUsable && entityId ? entityId : undefined,
        actor: actor || undefined,
        action: action || undefined,
        createdAtFrom: createdAtFrom ? new Date(createdAtFrom).toISOString() : undefined,
        createdAtTo: createdAtTo ? new Date(createdAtTo).toISOString() : undefined,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const entries = query.data?.data ?? [];
  const meta = query.data?.meta;
  const anyFilterActive = Boolean(entityType || entityId || actor || action || createdAtFrom || createdAtTo);

  function clearFilters() {
    setEntityType('');
    setEntityId('');
    setActor('');
    setAction('');
    setCreatedAtFrom('');
    setCreatedAtTo('');
    setPage(1);
    setFocusedIndex(0);
  }

  useQueueKeyboardNav({
    rowCount: entries.length,
    focusedIndex,
    setFocusedIndex,
    onOpen: (index) => setDetailEntry(entries[index] ?? null),
    onEscape: () => setDetailEntry(null),
    onFocusSearch: () => actorInputRef.current?.focus(),
    enabled: !detailEntry,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-heading-lg text-neutral-900">Audit Log</h1>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="Entity"
          value={entityType}
          onChange={(e) => {
            const next = e.target.value as AuditEntityType | '';
            setEntityType(next);
            if (!next) setEntityId('');
            setPage(1);
            setFocusedIndex(0);
          }}
          className="w-44"
        >
          <option value="">All</option>
          {AUDIT_ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTITY_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        <div className="w-52">
          <label className="mb-1.5 block text-body-sm font-medium text-neutral-700" htmlFor="audit-entity-id">
            Entity ID
          </label>
          <input
            id="audit-entity-id"
            value={entityId}
            disabled={!entityIdUsable}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
            placeholder={entityIdUsable ? 'e.g. 66f1…' : 'Select an entity type first'}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-sm text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
        </div>

        <div className="w-52">
          <label className="mb-1.5 block text-body-sm font-medium text-neutral-700" htmlFor="audit-actor">
            Admin (actor ID)
          </label>
          <input
            id="audit-actor"
            ref={actorInputRef}
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. 66f1…"
            className="h-10 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-sm text-neutral-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
        </div>

        <Select
          label="Action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value as AuditAction | '');
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>

        <div className="w-40">
          <label className="mb-1.5 block text-body-sm font-medium text-neutral-700" htmlFor="audit-from">
            From
          </label>
          <input
            id="audit-from"
            type="date"
            value={createdAtFrom}
            onChange={(e) => {
              setCreatedAtFrom(e.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-sm text-neutral-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
        </div>

        <div className="w-40">
          <label className="mb-1.5 block text-body-sm font-medium text-neutral-700" htmlFor="audit-to">
            To
          </label>
          <input
            id="audit-to"
            type="date"
            value={createdAtTo}
            onChange={(e) => {
              setCreatedAtTo(e.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-sm text-neutral-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
        </div>

        {anyFilterActive && (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* spec 05.5 §6.1 — offset pagination on an append-only, unbounded
          collection can skip or repeat rows as new entries land while
          paging; surfaced rather than presented as reliable. */}
      {meta && meta.page > 1 && (
        <p className="mt-3 text-caption text-neutral-500">
          Results may shift slightly if new activity occurs while browsing older pages — use the date filter to pin a
          stable window.
        </p>
      )}

      <div className="mt-4">
        {query.isLoading && (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-none border-b border-border bg-surface-card" />
            ))}
          </div>
        )}

        {query.isError && (
          <EmptyState
            title="Couldn't load the audit log"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => query.refetch() }}
          />
        )}

        {!query.isLoading && !query.isError && entries.length === 0 && (
          <EmptyState
            title="No matching audit entries."
            description={anyFilterActive ? 'Try a different filter or clear the filters.' : ''}
            action={anyFilterActive ? { label: 'Clear filters', onClick: clearFilters } : undefined}
          />
        )}

        {!query.isLoading && !query.isError && entries.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell>Admin</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
                <TableHeaderCell>Entity</TableHeaderCell>
                <TableHeaderCell>Change</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Detail</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow
                  key={entry._id}
                  onClick={() => setFocusedIndex(index)}
                  onDoubleClick={() => setDetailEntry(entry)}
                  className={cn('cursor-pointer', index === focusedIndex && 'bg-surface-sunken ring-1 ring-inset ring-focus-ring')}
                >
                  <TableCell className="whitespace-nowrap text-caption text-neutral-600">
                    {new Date(entry.createdAt).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell>{auditActorLabel(entry.actor)}</TableCell>
                  <TableCell className="font-medium text-neutral-900">{entry.action}</TableCell>
                  <TableCell className="text-neutral-600">
                    {entry.entityType} #{entry.entityId.slice(-6)}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {entry.previousState && entry.newState ? `${entry.previousState} → ${entry.newState}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" onClick={() => setDetailEntry(entry)}>
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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

      <AuditEntryDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </div>
  );
}

function AuditEntryDetailModal({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  return (
    <Modal open={entry !== null} onClose={onClose} title="Audit entry detail">
      <ModalBody>
        {entry && (
          <dl className="space-y-3 text-body-sm">
            <DetailRow label="When" value={new Date(entry.createdAt).toISOString()} mono />
            <DetailRow label="Who" value={`${auditActorDetailLabel(entry.actor)} — role: ${entry.actorRole}`} />
            <DetailRow label="What" value={entry.action} />
            <DetailRow label="Entity" value={`${entry.entityType} #${entry.entityId}`} mono />
            <DetailRow
              label="Change"
              value={entry.previousState && entry.newState ? `${entry.previousState} → ${entry.newState}` : '—'}
            />
            <DetailRow label="Reason" value={entry.reason ?? '— (none given)'} />
            {entry.ipAddress && <DetailRow label="IP address" value={entry.ipAddress} mono />}
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div>
                <dt className="text-caption font-medium uppercase tracking-wide text-neutral-500">Metadata</dt>
                <dd className="mt-1 rounded-sm border border-border bg-surface-sunken px-3 py-2 font-mono text-mono-sm text-neutral-800">
                  {Object.entries(entry.metadata).map(([key, value]) => (
                    <div key={key}>
                      {key}:{' '}
                      {REDACTED_METADATA_KEYS.test(key)
                        ? '(redacted)'
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={mono ? 'font-mono text-mono-sm text-neutral-900' : 'text-neutral-900'}>{value}</dd>
    </div>
  );
}
