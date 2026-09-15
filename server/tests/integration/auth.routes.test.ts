import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

function parseCookies(setCookieHeader: string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const raw of setCookieHeader ?? []) {
    const [pair] = raw.split(';');
    const [name, value] = pair!.split('=');
    cookies[name!] = value ?? '';
  }
  return cookies;
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ada Lovelace',
    email: `ada-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    password: 'correct horse battery staple',
    drivingLicenceNumber: 'DL1234567',
    ...overrides,
  };
}

describe('Auth routes (AUTH-09): full register -> login -> refresh -> logout cycle', () => {
  it('registers, sets httpOnly cookies with the right flags, and returns 201', async () => {
    const res = await request(app).post('/api/auth/register').send(registerBody());
    expect(res.status).toBe(201);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const at = setCookie.find((c) => c.startsWith('rgo_at='))!;
    const rt = setCookie.find((c) => c.startsWith('rgo_rt='))!;
    const csrf = setCookie.find((c) => c.startsWith('rgo_csrf='))!;

    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\/api/i);
    expect(rt).toMatch(/HttpOnly/i);
    expect(csrf).not.toMatch(/HttpOnly/i); // JS-readable by design (spec 03 §4.2)
  });

  it('rejects a strictObject violation (e.g. a role in the body) with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...registerBody(), role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email registration with 409', async () => {
    const body = registerBody();
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(registerBody({ email: body.email }));
    expect(res.status).toBe(409);
  });

  it('full cycle: register -> me -> login -> refresh -> logout -> me fails', async () => {
    const body = registerBody();
    const registerRes = await request(app).post('/api/auth/register').send(body);
    expect(registerRes.status).toBe(201);
    let cookies = parseCookies(registerRes.headers['set-cookie'] as unknown as string[]);

    const meRes = await request(app).get('/api/auth/me').set('Cookie', [`rgo_at=${cookies.rgo_at}`]);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(body.email);
    expect(meRes.body.data.flags).toEqual({ isOwner: false, isSuperAdmin: false });

    const loginRes = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(loginRes.status).toBe(200);
    cookies = parseCookies(loginRes.headers['set-cookie'] as unknown as string[]);

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', [`rgo_rt=${cookies.rgo_rt}`]);
    expect(refreshRes.status).toBe(200);
    const rotatedCookies = parseCookies(refreshRes.headers['set-cookie'] as unknown as string[]);
    expect(rotatedCookies.rgo_rt).not.toBe(cookies.rgo_rt);

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', [`rgo_rt=${rotatedCookies.rgo_rt}`]);
    expect(logoutRes.status).toBe(204);
    const clearedCookies = logoutRes.headers['set-cookie'] as unknown as string[];
    expect(clearedCookies.some((c) => c.startsWith('rgo_at=;') || c.includes('rgo_at=;'))).toBe(true);

    // The rotated refresh token no longer works after logout.
    const reuseAfterLogout = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`rgo_rt=${rotatedCookies.rgo_rt}`]);
    expect(reuseAfterLogout.status).toBe(401);
  });

  it('logout is idempotent and always 204, even with no session at all', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });

  it('GET /api/auth/me without rgo_at is 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('reused refresh token after a rotation is rejected and clears cookies', async () => {
    const body = registerBody();
    const registerRes = await request(app).post('/api/auth/register').send(body);
    const cookies = parseCookies(registerRes.headers['set-cookie'] as unknown as string[]);

    await request(app).post('/api/auth/refresh').set('Cookie', [`rgo_rt=${cookies.rgo_rt}`]);
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', [`rgo_rt=${cookies.rgo_rt}`]);
    expect(reuseRes.status).toBe(401);
    const cleared = reuseRes.headers['set-cookie'] as unknown as string[];
    expect(cleared.some((c) => c.startsWith('rgo_rt=;'))).toBe(true);
  });
});
