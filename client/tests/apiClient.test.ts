import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchWithMeta, ApiError } from '../src/lib/apiClient';
import { useAuthStore } from '../src/store/auth.store';

const OK_DATA = { data: { ok: true } };
const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED', message: 'nope', requestId: 'r1' } };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('apiClient — silent refresh on an expired access token (regression)', () => {
  beforeEach(() => {
    useAuthStore.getState().setUser({
      id: 'u1',
      name: 'A',
      email: 'a@example.com',
      phone: '1',
      role: 'ADMIN',
      isActive: true,
      drivingLicence: { numberMasked: '****' },
      createdAt: new Date().toISOString(),
      flags: { isOwner: false, isSuperAdmin: false },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clear();
  });

  it('on a 401, refreshes once and retries the original request, returning its data', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/auth/refresh')) return jsonResponse(200, { data: { ok: true } });
      if (url.includes('/api/admin/dashboard/counts')) {
        // First call 401s (expired token); the retry after refresh succeeds.
        const isRetry = calls.filter((c) => c.includes('/api/admin/dashboard/counts')).length > 1;
        return isRetry ? jsonResponse(200, OK_DATA) : jsonResponse(401, UNAUTHENTICATED);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await apiFetch<{ ok: boolean }>('/admin/dashboard/counts');
    expect(result).toEqual({ ok: true });
    expect(calls.filter((c) => c.includes('/api/auth/refresh'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/api/admin/dashboard/counts'))).toHaveLength(2);
  });

  it('shares a single in-flight refresh across a concurrent burst of 401s', async () => {
    let refreshCalls = 0;
    const seenPaths = new Set<string>();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, { data: { ok: true } });
      }
      // Every distinct admin path 401s exactly once, then succeeds on retry.
      const seen = seenPaths.has(url);
      seenPaths.add(url);
      return seen ? jsonResponse(200, { data: [], meta: { total: 0 } }) : jsonResponse(401, UNAUTHENTICATED);
    });

    await Promise.all([
      apiFetchWithMeta('/admin/listings'),
      apiFetchWithMeta('/admin/bookings'),
      apiFetch('/admin/audit'),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it('clears the auth store (rather than looping) when the refresh itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) return jsonResponse(401, UNAUTHENTICATED);
      return jsonResponse(401, UNAUTHENTICATED);
    });

    await expect(apiFetch('/admin/dashboard/counts')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('never attempts a refresh for /auth/me (a guest 401 there is expected, not an error to recover from)', async () => {
    let refreshCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) refreshCalls += 1;
      if (url.includes('/api/auth/me')) return jsonResponse(401, UNAUTHENTICATED);
      throw new Error(`unexpected fetch: ${url}`);
    });

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(refreshCalls).toBe(0);
  });
});
