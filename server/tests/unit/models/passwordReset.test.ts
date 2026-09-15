import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { PasswordReset } from '../../../src/models/PasswordReset.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: new mongoose.Types.ObjectId(),
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 30 * 60_000),
    ...overrides,
  };
}

describe('PasswordReset model (D11)', () => {
  it('defaults usedAt to null (single-use, not yet redeemed)', async () => {
    const reset = await PasswordReset.create(fixture());
    expect(reset.usedAt).toBeNull();
  });

  it('enforces the unique tokenHash index', async () => {
    await PasswordReset.create(fixture());
    await expect(
      PasswordReset.create(fixture({ user: new mongoose.Types.ObjectId() })),
    ).rejects.toThrow(/E11000/);
  });

  it('rejects a record with no expiresAt', async () => {
    const { expiresAt: _expiresAt, ...rest } = fixture();
    await expect(PasswordReset.create(rest)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await PasswordReset.collection.indexes();
    const byKey = new Map(indexes.map((i) => [JSON.stringify(i.key), i]));
    expect(byKey.get(JSON.stringify({ tokenHash: 1 }))?.unique).toBe(true);
    expect(byKey.has(JSON.stringify({ user: 1 }))).toBe(true);
  });
});
