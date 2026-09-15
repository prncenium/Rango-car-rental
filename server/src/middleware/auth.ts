import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AccountInactiveError, AuthError, ForbiddenError } from '../lib/errors.js';
import { User } from '../models/User.model.js';
import type { ActorContext } from '../lib/actor.js';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: ActorContext;
  }
}

// requireAuth re-reads role/isActive from the database rather than trusting
// the (up to 15-minute-stale) token claims — spec 02 §6.1: "the token is
// never the authority for a guard."
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.rgo_at as string | undefined;
    if (!token) {
      throw new AuthError('Authentication required.');
    }
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('role isActive');
    if (!user) {
      throw new AuthError('Authentication required.');
    }
    if (!user.isActive) {
      throw new AccountInactiveError('This account has been deactivated.');
    }
    req.actor = {
      userId: user._id,
      role: user.role,
      isActive: user.isActive,
      ip: req.ip,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// AUTHZ-1/2: only ADMIN and SUPER_ADMIN may reach /api/admin. Role checks are
// always `role in {ADMIN, SUPER_ADMIN}`, never `=== 'ADMIN'` (design D11).
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) {
    next(new AuthError('Authentication required.'));
    return;
  }
  if (req.actor.role !== 'ADMIN' && req.actor.role !== 'SUPER_ADMIN') {
    next(new ForbiddenError('Admin access required.'));
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) {
    next(new AuthError('Authentication required.'));
    return;
  }
  if (req.actor.role !== 'SUPER_ADMIN') {
    next(new ForbiddenError('Super-admin access required.'));
    return;
  }
  next();
}
