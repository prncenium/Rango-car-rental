import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// spec 03 §6.2 / spec 02 §8.4 — double-submit CSRF token on every
// state-changing request (POST/PATCH/DELETE/PUT) under /api/user and
// /api/admin (and /api/superadmin, spec 03 §2.7). `rgo_csrf` is the one
// cookie that is JS-readable by design; the client echoes it back in
// X-CSRF-Token. Mismatch or absence is 403 FORBIDDEN, never a silent pass —
// sameSite=lax alone does not cover every cross-site vector (spec 03 §6.2).
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const cookieToken = req.cookies?.rgo_csrf as string | undefined;
  const headerToken = req.header('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new ForbiddenError('Missing or invalid CSRF token.'));
    return;
  }
  next();
}
