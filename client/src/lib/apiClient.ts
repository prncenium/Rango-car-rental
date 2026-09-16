import { getCsrfToken } from './csrf';

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

// spec 02 §2.1's envelope (`{ data }` / `{ error }`) and spec 03 §6.2's
// double-submit CSRF (X-CSRF-Token echoing the rgo_csrf cookie) in one place,
// so every page-level call site only deals with the parsed `data` shape.
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const init: RequestInit = { method, headers, credentials: 'include' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`/api${path}`, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as { data: T } | { error: ApiErrorBody };
  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }
  return json.data;
}

// Same envelope as apiFetch, but keeps `meta` — needed by every paginated
// list endpoint (spec 02 §4.1's `{ data, meta }` shape), which apiFetch's
// data-only return discards.
export async function apiFetchWithMeta<T, M>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; meta: M }> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const init: RequestInit = { method, headers, credentials: 'include' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`/api${path}`, init);

  const json = (await response.json()) as { data: T; meta: M } | { error: ApiErrorBody };
  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }
  return json;
}
