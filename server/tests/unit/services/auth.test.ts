import { describe, expect, it } from 'vitest';
import { login, register } from '../../../src/services/auth.service.js';
import { User } from '../../../src/models/User.model.js';
import { hashPassword } from '../../../src/lib/password.js';
import { AuditLog } from '../../../src/models/AuditLog.model.js';

const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

function registerInput(overrides: Partial<Parameters<typeof register>[0]> = {}) {
  return {
    name: 'Ada Lovelace',
    email: `ada-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    password: 'correct horse battery staple',
    drivingLicenceNumber: 'DL1234567',
    ...overrides,
  };
}

describe('auth.service — register (AUTH-07)', () => {
  it('creates an active USER, hashes the password, and writes USER_REGISTERED', async () => {
    const input = registerInput();
    const { user, tokens } = await register(input, ctx);

    expect(user.role).toBe('USER');
    expect(user.isActive).toBe(true);
    expect(user.failedLoginCount).toBe(0);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const stored = await User.findById(user._id).select('+passwordHash');
    expect(stored!.passwordHash).not.toBe(input.password);

    const log = await AuditLog.findOne({ entityType: 'USER', entityId: user._id, action: 'USER_REGISTERED' });
    expect(log).not.toBeNull();
  });

  it('rejects a duplicate email with a domain error, not a 500', async () => {
    const input = registerInput();
    await register(input, ctx);
    await expect(register(registerInput({ email: input.email }), ctx)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a duplicate phone with a domain error', async () => {
    const input = registerInput();
    await register(input, ctx);
    await expect(register(registerInput({ phone: input.phone }), ctx)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('auth.service — login (AUTH-07)', () => {
  it('logs in with correct credentials', async () => {
    const input = registerInput();
    await register(input, ctx);

    const { user, tokens } = await login({ email: input.email, password: input.password }, ctx);
    expect(String(user._id)).toBeTruthy();
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('rejects a wrong password with UNAUTHENTICATED', async () => {
    const input = registerInput();
    await register(input, ctx);

    await expect(login({ email: input.email, password: 'totally the wrong password' }, ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an unknown email with the identical UNAUTHENTICATED error', async () => {
    await expect(
      login({ email: 'nobody-at-all@example.com', password: 'whatever password this is' }, ctx),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects a deactivated user with ACCOUNT_INACTIVE', async () => {
    const input = registerInput();
    const { user } = await register(input, ctx);
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });

    await expect(login({ email: input.email, password: input.password }, ctx)).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
  });

  it('audits a successful ADMIN login but not a successful USER login', async () => {
    const input = registerInput();
    const { user } = await register(input, ctx);
    await User.updateOne({ _id: user._id }, { $set: { role: 'ADMIN' } });
    const hash = await hashPassword(input.password);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: hash } });

    await login({ email: input.email, password: input.password }, ctx);

    const adminLog = await AuditLog.findOne({ entityId: user._id, action: 'ADMIN_LOGIN_SUCCEEDED' });
    expect(adminLog).not.toBeNull();
  });
});
