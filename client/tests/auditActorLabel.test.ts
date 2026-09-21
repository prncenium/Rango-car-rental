import { describe, expect, it } from 'vitest';
import { auditActorDetailLabel, auditActorLabel } from '../src/api/admin';

// Regression: GET /api/admin/audit populates `actor` via Mongoose — which
// returns `null` for a dangling ref (the referenced User no longer exists),
// not an omitted field. Dashboard.tsx and AuditLog.tsx both used to do
// `typeof entry.actor === 'string' ? entry.actor : entry.actor.name`
// directly, which crashed the whole page with "Cannot read properties of
// null (reading 'name')" the moment any audit row's actor had been deleted.
describe('auditActorLabel / auditActorDetailLabel', () => {
  const populated = { _id: 'u1', name: 'Asha K.', email: 'asha@example.com', role: 'ADMIN' };

  it('returns the name for a populated actor', () => {
    expect(auditActorLabel(populated)).toBe('Asha K.');
  });

  it('returns the raw string for an unpopulated (id-only) actor', () => {
    expect(auditActorLabel('u1')).toBe('u1');
  });

  it('does not throw, and reports a deleted-account placeholder, for a null actor', () => {
    expect(() => auditActorLabel(null)).not.toThrow();
    expect(auditActorLabel(null)).toBe('Deleted account');
  });

  it('detail label includes the email for a populated actor', () => {
    expect(auditActorDetailLabel(populated)).toBe('Asha K. (asha@example.com)');
  });

  it('detail label does not throw for a null actor', () => {
    expect(() => auditActorDetailLabel(null)).not.toThrow();
    expect(auditActorDetailLabel(null)).toBe('Deleted account');
  });
});
