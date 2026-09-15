import { describe, expect, it } from 'vitest';
import { login, logout, refresh, register } from '../../../src/services/auth.service.js';
import { Session } from '../../../src/models/Session.model.js';
import { User } from '../../../src/models/User.model.js';

const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

function registerInput() {
  return {
    name: 'Grace Hopper',
    email: `grace-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    password: 'correct horse battery staple',
    drivingLicenceNumber: 'DL7654321',
  };
}

describe('auth.service — refresh (AUTH-08)', () => {
  it('rotates the session and issues a new token pair', async () => {
    const { tokens } = await register(registerInput(), ctx);
    const before = await Session.findOne({ refreshTokenHash: { $exists: true } }).sort({ createdAt: -1 });

    const { tokens: rotated } = await refresh(tokens.refreshToken, ctx);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    expect(rotated.accessToken).not.toBe(tokens.accessToken);

    const originalSession = await Session.findById(before!._id);
    expect(originalSession!.status).toBe('ROTATED');
  });

  it('detects reuse of a rotated refresh token and revokes the whole family', async () => {
    const { tokens } = await register(registerInput(), ctx);
    const firstRefreshToken = tokens.refreshToken;

    await refresh(firstRefreshToken, ctx); // rotates once, legitimately

    // Reusing the now-rotated token must fail and take out the family.
    await expect(refresh(firstRefreshToken, ctx)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const sessions = await Session.find({});
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    for (const s of sessions) {
      expect(s.status).not.toBe('ACTIVE');
    }
  });

  it('rejects a refresh for a user deactivated after the token was issued', async () => {
    const input = registerInput();
    const { user, tokens } = await register(input, ctx);
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });

    await expect(refresh(tokens.refreshToken, ctx)).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
  });

  it('rejects a malformed or unknown refresh token', async () => {
    await expect(refresh('not-a-real-token', ctx)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('auth.service — logout (AUTH-08)', () => {
  it('revokes the session behind a valid refresh token', async () => {
    const { tokens } = await register(registerInput(), ctx);
    await logout(tokens.refreshToken);

    await expect(refresh(tokens.refreshToken, ctx)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('is a no-op — never throws — when there is no refresh token at all', async () => {
    await expect(logout(undefined)).resolves.toBeUndefined();
  });

  it('does not throw for an already-invalid/expired refresh token (idempotent)', async () => {
    await expect(logout('garbage-token-value')).resolves.toBeUndefined();
  });
});

describe('auth.service — login supersedes nothing it does not touch', () => {
  it('two logins for the same user each get their own independent session', async () => {
    const input = registerInput();
    await register(input, ctx);
    const { tokens: a } = await login({ email: input.email, password: input.password }, ctx);
    const { tokens: b } = await login({ email: input.email, password: input.password }, ctx);
    expect(a.refreshToken).not.toBe(b.refreshToken);

    // Both remain independently usable — refreshing one does not invalidate the other.
    await refresh(a.refreshToken, ctx);
    await expect(refresh(b.refreshToken, ctx)).resolves.toBeDefined();
  });
});
