import { getCsrfToken } from './csrf';
import { useAuthStore } from '../store/auth.store';

// Mirrors spec 02 §3.1's error envelope exactly, so callers can branch on
// `code` (never `message`) per spec 02 §3.1: "clients branch on this, never
// on message."
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly requestId: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
}

// Paths that must never trigger a refresh-and-retry themselves — either
// because they ARE the refresh call (avoiding infinite recursion) or because
// a 401 from them is a normal, expected "not logged in" outcome that every
// caller already handles on its own (e.g. PublicHeader/AdminShell's
// `getCurrentUser().catch(() => clear())` on first load for a guest).
const AUTH_RETRY_EXEMPT_PATHS = new Set(['/auth/refresh', '/auth/login', '/auth/register', '/auth/me']);

function buildHeaders(method: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (MUTATING_METHODS.has(method)) {
    // Read fresh on every attempt, never cached across a retry — a
    // successful refresh rotates the rgo_csrf cookie, so the pre-refresh
    // token would 403 on the retried request if reused.
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return headers;
}

// The access token is short-lived (15 min, server/src/lib/jwt.ts). Without
// this, once it expires every subsequent admin/user request 401s forever
// until the person manually logs in again — the "everything suddenly breaks
// after using the app for a while" bug. A concurrent burst of requests (e.g.
// a page firing five queries at once) must share a single in-flight refresh
// rather than each calling POST /api/auth/refresh independently: the server
// rotates the refresh token on each call, so a second parallel call would
// present an already-rotated (stale) token and trip reuse detection —
// spec 03 §4.5 — forcing a real logout instead of a silent recovery.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Shared by apiFetch/apiFetchWithMeta: performs the request, and on a 401
// from a non-exempt path, attempts exactly one shared refresh + one retry
// (CL-02's accept criterion) before handing back whatever response resulted.
// On a refresh failure, clears the auth store rather than forcing a redirect
// itself — apiClient has no router context, and a hard redirect here would
// wrongly kick a logged-out guest off a public page just because a
// background `/auth/me` check 401'd. Clearing the store lets each shell's
// own existing guard (e.g. AdminShell's `status === 'guest'` effect) redirect
// only where that is actually the correct behavior.
async function performRequest(path: string, options: ApiRequestOptions, isRetry = false): Promise<Response> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined;
  const headers = buildHeaders(method, hasBody);
  const init: RequestInit = { method, headers, credentials: 'include' };
  if (hasBody) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api${path}`, init);

  if (response.status !== 401 || isRetry || AUTH_RETRY_EXEMPT_PATHS.has(path)) {
    return response;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    useAuthStore.getState().clear();
    return response;
  }
  return performRequest(path, options, true);
}

// spec 02 §2.1's envelope (`{ data }` / `{ error }`) and spec 03 §6.2's
// double-submit CSRF (X-CSRF-Token echoing the rgo_csrf cookie) in one place,
// so every page-level call site only deals with the parsed `data` shape.
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as { data: T } | { error: ApiErrorBody };
  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }
  return json.data;
}

// For binary downloads (currently: the rental agreement PDF) — the server
// sends the raw file on success, not the `{data}` envelope, so this can't
// reuse apiFetch. On error the server still sends the normal JSON envelope,
// so that path is parsed the same way every other call site expects.
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await performRequest(path, {});
  if (!response.ok) {
    const json = (await response.json()) as { error: ApiErrorBody };
    throw new ApiError(response.status, json.error);
  }
  return response.blob();
}

// Triggers a browser "Save As" for a blob already in memory — the standard
// object-URL-and-synthetic-click dance, since there's no <a href> to point
// at (the file only exists as a fetched blob, behind auth).
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Same envelope as apiFetch, but keeps `meta` — needed by every paginated
// list endpoint (spec 02 §4.1's `{ data, meta }` shape), which apiFetch's
// data-only return discards.
export async function apiFetchWithMeta<T, M>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; meta: M }> {
  const response = await performRequest(path, options);

  const json = (await response.json()) as { data: T; meta: M } | { error: ApiErrorBody };
  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }
  return json;
}
