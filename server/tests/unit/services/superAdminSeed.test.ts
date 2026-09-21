import { describe, expect, it } from 'vitest';
import { seedFirstSuperAdmin, SuperAdminAlreadyExistsError } from '../../../src/services/superAdmin.service.js';
import { User } from '../../../src/models/User.model.js';
import { AuditLog } from '../../../src/models/AuditLog.model.js';

function bootstrapInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Root Admin',
    email: `root-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    passwordHash: 'argon2-hash-placeholder',
    drivingLicenceNumber: 'DL1420110012345',
    ...overrides,
  };
}

// spec 03 §11.1-11.2 — the first-run CLI bootstrap's write path.
describe('superAdmin.service — seedFirstSuperAdmin (OPS-01 / spec 03 §11.2)', () => {
  it('creates the first SUPER_ADMIN and writes a self-referential SUPER_ADMIN_SEEDED audit row', async () => {
    const input = bootstrapInput();
    const created = await seedFirstSuperAdmin(input);

    expect(created.role).toBe('SUPER_ADMIN');
    expect(created.isActive).toBe(true);
    expect(created.email).toBe(input.email);

    const log = await AuditLog.findOne({ action: 'SUPER_ADMIN_SEEDED', entityId: created._id });
    expect(log).not.toBeNull();
    expect(String(log!.actor)).toBe(String(created._id));
    expect(log!.actorRole).toBe('SUPER_ADMIN');
    expect(log!.newState).toBe('SUPER_ADMIN');
  });

  it('refuses to run if a SUPER_ADMIN already exists (bootstrap-not-backdoor guard)', async () => {
    const first = await seedFirstSuperAdmin(bootstrapInput());

    await expect(seedFirstSuperAdmin(bootstrapInput())).rejects.toBeInstanceOf(SuperAdminAlreadyExistsError);

    // Idempotency: exactly one SUPER_ADMIN exists, the original one.
    const superAdmins = await User.find({ role: 'SUPER_ADMIN' });
    expect(superAdmins).toHaveLength(1);
    expect(String(superAdmins[0]!._id)).toBe(String(first._id));
  });

  it('refuses a duplicate email even before any SUPER_ADMIN exists', async () => {
    const email = `dupe-${Math.random().toString(36).slice(2)}@example.com`;
    await User.create({
      name: 'Existing',
      email,
      phone: `+1${Math.floor(Math.random() * 1e9)}`,
      passwordHash: 'hash',
      role: 'USER',
      isActive: true,
      drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
    });

    await expect(seedFirstSuperAdmin(bootstrapInput({ email }))).rejects.toMatchObject({ code: 'CONFLICT' });

    const superAdmins = await User.find({ role: 'SUPER_ADMIN' });
    expect(superAdmins).toHaveLength(0);
  });

  it('refuses a duplicate phone number', async () => {
    const phone = `+1${Math.floor(Math.random() * 1e9)}`;
    await User.create({
      name: 'Existing',
      email: `existing-${Math.random().toString(36).slice(2)}@example.com`,
      phone,
      passwordHash: 'hash',
      role: 'USER',
      isActive: true,
      drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
    });

    await expect(seedFirstSuperAdmin(bootstrapInput({ phone }))).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
