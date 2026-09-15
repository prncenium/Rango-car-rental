import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { User } from '../../../src/models/User.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '9990001111',
    passwordHash: 'hash',
    drivingLicence: { number: 'KA0120230001234', enteredAt: new Date() },
    ...overrides,
  };
}

describe('User model (M-01)', () => {
  it('never returns passwordHash on a default query', async () => {
    await User.create(fixture());
    const found = await User.findOne({ email: 'asha@example.com' });
    expect(found).not.toBeNull();
    expect(found!.toObject()).not.toHaveProperty('passwordHash');
  });

  it('enforces the unique email index', async () => {
    await User.create(fixture());
    await expect(User.create(fixture({ phone: '9990002222' }))).rejects.toThrow(/E11000/);
  });

  it('enforces the unique phone index', async () => {
    await User.create(fixture());
    await expect(User.create(fixture({ email: 'other@example.com' }))).rejects.toThrow(/E11000/);
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await User.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ email: 1 }));
    expect(keys).toContain(JSON.stringify({ phone: 1 }));
    expect(keys).toContain(JSON.stringify({ role: 1 }));
    expect(keys).toContain(JSON.stringify({ isActive: 1 }));
  });

  it('rejects a user with no drivingLicence.number', async () => {
    await expect(
      User.create({ ...fixture(), drivingLicence: { enteredAt: new Date() } }),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('defaults role to USER and isActive to true', async () => {
    const user = await User.create(fixture());
    expect(user.role).toBe('USER');
    expect(user.isActive).toBe(true);
    expect(user.failedLoginCount).toBe(0);
  });
});
