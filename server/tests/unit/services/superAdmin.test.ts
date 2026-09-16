import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  demoteAdmin,
  promoteToAdmin,
  promoteToSuperAdmin,
  getSystemConfig,
  updateSystemConfig,
} from '../../../src/services/superAdmin.service.js';
import { User } from '../../../src/models/User.model.js';
import { Session } from '../../../src/models/Session.model.js';
import { AuditLog } from '../../../src/models/AuditLog.model.js';
import type { ActorContext } from '../../../src/lib/actor.js';
import type { Role } from '@rango/shared';

async function makeUser(role: Role, overrides: Partial<Record<string, unknown>> = {}) {
  const user = await User.create({
    name: 'Test User',
    email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    passwordHash: 'not-a-real-hash',
    role,
    isActive: true,
    drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
    ...overrides,
  });
  return user;
}

function actorFor(user: { _id: Types.ObjectId; role: Role }): ActorContext {
  return { userId: user._id, role: user.role, isActive: true, ip: '127.0.0.1' };
}

async function makeActiveSession(userId: Types.ObjectId) {
  return Session.create({
    user: userId,
    refreshTokenHash: `hash-${Math.random().toString(36).slice(2)}`,
    family: `family-${Math.random().toString(36).slice(2)}`,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
}

describe('superAdmin.service — promote/demote (SA-01)', () => {
  it('promotes a USER to ADMIN, revokes their sessions, and writes an audit row', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const target = await makeUser('USER');
    const session = await makeActiveSession(target._id);

    const result = await promoteToAdmin(String(target._id), 'trusted operator', actorFor(superAdmin));
    expect(result.role).toBe('ADMIN');

    const reloadedSession = await Session.findById(session._id);
    expect(reloadedSession!.status).toBe('REVOKED');
    expect(reloadedSession!.revokedReason).toBe('ADMIN_REVOKED');

    const log = await AuditLog.findOne({ entityType: 'USER', entityId: target._id, action: 'USER_PROMOTED_TO_ADMIN' });
    expect(log).not.toBeNull();
    expect(log!.previousState).toBe('USER');
    expect(log!.newState).toBe('ADMIN');
  });

  it('rejects promoting an account that is already ADMIN/SUPER_ADMIN', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const alreadyAdmin = await makeUser('ADMIN');

    await expect(promoteToAdmin(String(alreadyAdmin._id), 'x', actorFor(superAdmin))).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('rejects promoting a suspended account', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const suspended = await makeUser('USER', { isActive: false });

    await expect(promoteToAdmin(String(suspended._id), 'x', actorFor(superAdmin))).rejects.toMatchObject({
      code: 'GUARD_FAILED',
      details: expect.objectContaining({ guard: 'guardTargetActive' }),
    });
  });

  it('demotes an ADMIN to USER and revokes sessions', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    // A second admin so guardNotLastAdmin never trips in this case.
    await makeUser('ADMIN');
    const target = await makeUser('ADMIN');
    const session = await makeActiveSession(target._id);

    const result = await demoteAdmin(String(target._id), 'no longer needed', actorFor(superAdmin));
    expect(result.role).toBe('USER');

    const reloadedSession = await Session.findById(session._id);
    expect(reloadedSession!.status).toBe('REVOKED');

    const log = await AuditLog.findOne({ entityType: 'USER', entityId: target._id, action: 'USER_DEMOTED_FROM_ADMIN' });
    expect(log).not.toBeNull();
  });

  it('rejects demoting the last remaining SUPER_ADMIN (lockout guard)', async () => {
    const onlySuperAdmin = await makeUser('SUPER_ADMIN');
    // A regular admin exists, but that must not matter — the tier is
    // counted independently (design D11, spec 03 §1.5's consequence). Acted
    // on by a distinct actor so guardNotSelf does not fire first — the
    // route itself only ever lets a SUPER_ADMIN call this, but the guard
    // under test here is the last-super-admin count, exercised at the
    // service layer directly.
    const actingAdmin = await makeUser('ADMIN');

    await expect(demoteAdmin(String(onlySuperAdmin._id), 'x', actorFor(actingAdmin))).rejects.toMatchObject({
      code: 'GUARD_FAILED',
      details: expect.objectContaining({ guard: 'guardNotLastSuperAdmin' }),
    });
  });

  it('rejects an actor demoting themselves', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    await makeUser('ADMIN'); // keep guardNotLastSuperAdmin/guardNotLastAdmin from tripping first

    await expect(demoteAdmin(String(superAdmin._id), 'x', actorFor(superAdmin))).rejects.toMatchObject({
      code: 'GUARD_FAILED',
      details: expect.objectContaining({ guard: 'guardNotSelf' }),
    });
  });

  it('promotes ADMIN to SUPER_ADMIN only with a matching confirmEmail, and revokes sessions', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const target = await makeUser('ADMIN');
    const session = await makeActiveSession(target._id);

    await expect(
      promoteToSuperAdmin(String(target._id), 'succession planning', 'wrong@example.com', actorFor(superAdmin)),
    ).rejects.toMatchObject({ code: 'GUARD_FAILED', details: expect.objectContaining({ guard: 'guardConfirmEmailMatches' }) });

    const result = await promoteToSuperAdmin(
      String(target._id),
      'succession planning',
      target.email,
      actorFor(superAdmin),
    );
    expect(result.role).toBe('SUPER_ADMIN');

    const reloadedSession = await Session.findById(session._id);
    expect(reloadedSession!.status).toBe('REVOKED');

    const log = await AuditLog.findOne({
      entityType: 'USER',
      entityId: target._id,
      action: 'USER_PROMOTED_TO_SUPER_ADMIN',
    });
    expect(log).not.toBeNull();
  });

  it('rejects promoting a non-ADMIN directly to SUPER_ADMIN (two-step path only)', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const plainUser = await makeUser('USER');

    await expect(
      promoteToSuperAdmin(String(plainUser._id), 'x', plainUser.email, actorFor(superAdmin)),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('superAdmin.service — SystemConfig (SA-02)', () => {
  it('reads the documented defaults when the singleton has never been written', async () => {
    const config = await getSystemConfig();
    expect(config.booking.maxDurationDays).toBe(90);
    expect(config.platform.registrationOpen).toBe(true);
  });

  it('writes only the changed keys, is prospective-only, and audits each change', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');

    const { config } = await updateSystemConfig(
      { booking: { maxDurationDays: 60 }, platform: { registrationOpen: false } },
      actorFor(superAdmin),
    );
    expect(config.booking.maxDurationDays).toBe(60);
    expect(config.platform.registrationOpen).toBe(false);
    // Untouched keys keep their default.
    expect(config.booking.maxAdvanceDays).toBe(365);

    const log = await AuditLog.findOne({ action: 'SYSTEM_CONFIG_CHANGED' }).sort({ createdAt: -1 });
    expect(log).not.toBeNull();
    expect(log!.metadata!.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'booking.maxDurationDays', previousValue: 90, newValue: 60 }),
        expect.objectContaining({ key: 'platform.registrationOpen', previousValue: true, newValue: false }),
      ]),
    );
  });

  it('reports how many in-flight bookings are unaffected when the turnaround buffer changes', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const { bookingsUnaffectedByBufferChange } = await updateSystemConfig(
      { booking: { turnaroundBufferDays: 2 } },
      actorFor(superAdmin),
    );
    expect(bookingsUnaffectedByBufferChange).toBe(0);
  });

  it('rejects an empty patch', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    await expect(updateSystemConfig({}, actorFor(superAdmin))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
