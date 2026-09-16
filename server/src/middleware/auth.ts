import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { verifyAccessToken } from '../lib/jwt.js';
import { AccountInactiveError, AuthError, ForbiddenError } from '../lib/errors.js';
import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
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
      sessionId: payload.sid && Types.ObjectId.isValid(payload.sid) ? new Types.ObjectId(payload.sid) : undefined,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// spec 03 §4.5 "the access-token gap" — revoking a Session does not
// invalidate an already-issued rgo_at, which stays signature-valid for up to
// 15 minutes. This document adopts option (b) for /api/admin and
// /api/superadmin only: one extra indexed read per request closes the gap to
// zero for the two namespaces where a just-revoked admin token retaining
// moderation authority is the material risk. /api/user and /api/auth keep
// option (a) (requireActive's DB re-read is enough there).
export async function requireActiveSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.sessionId) {
      throw new AuthError('Authentication required.');
    }
    const session = await Session.findById(req.actor.sessionId).select('status');
    if (!session || session.status !== 'ACTIVE') {
      throw new AuthError('This session has been revoked.');
    }
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
