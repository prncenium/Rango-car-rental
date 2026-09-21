import type { NextFunction, Request, Response } from 'express';
import { RateLimitedError } from '../lib/errors.js';

interface Counter {
  count: number;
  resetAt: number;
}

// Fixed-window, in-process counters (spec 02 §5). Single-node only by
// design — a multi-instance deployment needs shared storage (spec 02 §5
// rule 5), which is out of this pass's scope.
const store = new Map<string, Counter>();

interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
  keyFn?: (req: Request) => string;
}

function actorOrIpKey(req: Request): string {
  return req.actor ? String(req.actor.userId) : (req.ip ?? 'unknown');
}

// spec 02 §5 rule 2 — failed requests still consume budget (checked here by
// counting on the way in, before the handler runs, rather than only on
// success). spec 02 §5 rule 4 — a 429 this limiter itself produced never
// consumes further budget, since it returns before incrementing again on a
// retry only through the client's own next request, not recursively here.
export function rateLimit(opts: RateLimitOptions) {
  const keyFn = opts.keyFn ?? ((req: Request) => req.ip ?? 'unknown');
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = `${opts.bucket}:${keyFn(req)}`;
    const now = Date.now();
    let counter = store.get(key);
    if (!counter || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, counter);
    }
    counter.count += 1;
    const remainingMs = counter.resetAt - now;
    const remaining = Math.max(0, opts.limit - counter.count);

    res.setHeader('RateLimit-Limit', String(opts.limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(remainingMs / 1000)));

    if (counter.count > opts.limit) {
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(new RateLimitedError('Too many requests.', { retryAfterSeconds, bucket: opts.bucket }));
      return;
    }
    next();
  };
}

// Per-namespace buckets: strict on /api/auth (unauthenticated, IP-keyed —
// the identity/credential-stuffing surface), standard on /api/user
// (authenticated, actor-keyed), relaxed on /api/public (unauthenticated,
// IP-keyed, high ceiling for read-only browsing).
export const authRateLimit = rateLimit({ bucket: 'auth', limit: 20, windowMs: 15 * 60 * 1000 });
export const userRateLimit = rateLimit({ bucket: 'user', limit: 120, windowMs: 60 * 1000, keyFn: actorOrIpKey });
export const adminRateLimit = rateLimit({ bucket: 'admin', limit: 600, windowMs: 60 * 1000, keyFn: actorOrIpKey });
export const publicRateLimit = rateLimit({ bucket: 'public', limit: 120, windowMs: 60 * 1000 });
// Tighter than the general public bucket — each request sends a real email,
// so this is the platform's one spam/cost surface with no auth in front of it.
export const contactRateLimit = rateLimit({ bucket: 'contact', limit: 5, windowMs: 15 * 60 * 1000 });
