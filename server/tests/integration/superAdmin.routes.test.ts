import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { User } from '../../src/models/User.model.js';
import { Session } from '../../src/models/Session.model.js';

const CSRF_TOKEN = 'test-csrf-token';

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signAccessToken(payload: { sub: string; role: string; isActive: boolean; sid?: string }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    jti: 'test-jti',
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlEncode(
    createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

async function makeUser(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', overrides: Partial<Record<string, unknown>> = {}) {
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
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: `test-${user._id}`,
    family: `test-${user._id}`,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return { user, token: signAccessToken({ sub: String(user._id), role, isActive: true, sid: String(session._id) }) };
}

describe('Super-admin endpoints (SA-03)', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/superadmin/config');
    expect(res.status).toBe(401);
  });

  it('rejects a plain ADMIN — only SUPER_ADMIN may reach this namespace', async () => {
    const { token } = await makeUser('ADMIN');
    const res = await request(app).get('/api/superadmin/config').set('Cookie', [`rgo_at=${token}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('promotes a user to ADMIN', async () => {
    const { token: superAdminToken } = await makeUser('SUPER_ADMIN');
    const { user: target } = await makeUser('USER');

    const res = await request(app)
      .post('/api/superadmin/admins')
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ userId: String(target._id), reason: 'trusted operator' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('demotes an admin back to USER', async () => {
    const { token: superAdminToken } = await makeUser('SUPER_ADMIN');
    await makeUser('ADMIN'); // second admin so guardNotLastAdmin never trips
    const { user: target } = await makeUser('ADMIN');

    const res = await request(app)
      .post(`/api/superadmin/admins/${target._id}/demote`)
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ reason: 'role no longer needed' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('USER');
  });

  it('blocks demoting the last remaining SUPER_ADMIN', async () => {
    const { token: superAdminToken, user: onlySuperAdmin } = await makeUser('SUPER_ADMIN');

    const res = await request(app)
      .post(`/api/superadmin/admins/${onlySuperAdmin._id}/demote`)
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ reason: 'x' });

    // guardNotSelf fires first here since the only SUPER_ADMIN is acting on
    // itself — either way this must never succeed.
    expect(res.status).toBe(409);
    expect(res.body.data).toBeUndefined();
  });

  it('promotes ADMIN to SUPER_ADMIN only when confirmEmail matches the target', async () => {
    const { token: superAdminToken } = await makeUser('SUPER_ADMIN');
    const { user: target } = await makeUser('ADMIN');

    const wrongEmail = await request(app)
      .post(`/api/superadmin/admins/${target._id}/promote-super`)
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ reason: 'succession', confirmEmail: 'nobody@example.com' });
    expect(wrongEmail.status).toBe(409);
    expect(wrongEmail.body.error.details.guard).toBe('guardConfirmEmailMatches');

    const res = await request(app)
      .post(`/api/superadmin/admins/${target._id}/promote-super`)
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ reason: 'succession', confirmEmail: target.email });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('SUPER_ADMIN');
  });

  it('reads and writes SystemConfig, reporting the buffer-change consequence', async () => {
    const { token: superAdminToken } = await makeUser('SUPER_ADMIN');

    const read = await request(app).get('/api/superadmin/config').set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN);
    expect(read.status).toBe(200);
    expect(read.body.data.booking.maxDurationDays).toBe(90);

    const write = await request(app)
      .patch('/api/superadmin/config')
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ booking: { turnaroundBufferDays: 1 } });
    expect(write.status).toBe(200);
    expect(write.body.data.booking.turnaroundBufferDays).toBe(1);
    expect(write.body.meta.bookingsUnaffectedByBufferChange).toBe(0);

    const rejectedKey = await request(app)
      .patch('/api/superadmin/config')
      .set('Cookie', [`rgo_at=${superAdminToken}`, `rgo_csrf=${CSRF_TOKEN}`]).set('X-CSRF-Token', CSRF_TOKEN)
      .send({ notARealSection: { x: 1 } });
    expect(rejectedKey.status).toBe(400);
  });
});
