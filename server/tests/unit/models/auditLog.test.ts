import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { AuditLog } from '../../../src/models/AuditLog.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    actor: new mongoose.Types.ObjectId(),
    actorRole: 'ADMIN',
    action: 'CAR_APPROVED',
    entityType: 'CAR',
    entityId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('AuditLog model (§1.6, §7)', () => {
  it('rejects an entry with no actor', async () => {
    const { actor: _actor, ...rest } = fixture();
    await expect(AuditLog.create(rest)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('rejects an unknown action', async () => {
    await expect(AuditLog.create(fixture({ action: 'NOT_A_REAL_ACTION' }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('is insert-only: has no updatedAt field', async () => {
    const entry = await AuditLog.create(fixture());
    expect(entry.toObject()).not.toHaveProperty('updatedAt');
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await AuditLog.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ entityType: 1, entityId: 1, createdAt: -1 }));
    expect(keys).toContain(JSON.stringify({ actor: 1, createdAt: -1 }));
    expect(keys).toContain(JSON.stringify({ action: 1 }));
  });
});
