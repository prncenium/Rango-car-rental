import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Session } from '../../../src/models/Session.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: new mongoose.Types.ObjectId(),
    refreshTokenHash: 'a'.repeat(64),
    family: 'family-1',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe('Session model (D11)', () => {
  it('defaults status to ACTIVE', async () => {
    const session = await Session.create(fixture());
    expect(session.status).toBe('ACTIVE');
  });

  it('enforces the unique refreshTokenHash index', async () => {
    await Session.create(fixture());
    await expect(
      Session.create(fixture({ family: 'family-2' })),
    ).rejects.toThrow(/E11000/);
  });

  it('rejects an unknown revokedReason', async () => {
    await expect(
      Session.create(fixture({ revokedReason: 'BOGUS' })),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('has the indexes required by design §4.2, including the expiresAt TTL index', async () => {
    const indexes = await Session.collection.indexes();
    const byKey = new Map(indexes.map((i) => [JSON.stringify(i.key), i]));
    expect(byKey.has(JSON.stringify({ user: 1, status: 1 }))).toBe(true);
    expect(byKey.get(JSON.stringify({ refreshTokenHash: 1 }))?.unique).toBe(true);
    expect(byKey.has(JSON.stringify({ family: 1 }))).toBe(true);
    expect(byKey.get(JSON.stringify({ expiresAt: 1 }))?.expireAfterSeconds).toBe(0);
  });
});
