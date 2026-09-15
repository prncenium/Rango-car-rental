import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { GuardFailedError, NotFoundError, ValidationError } from '../lib/errors.js';
import { User, type UserDoc } from '../models/User.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { guardNotLastAdmin, guardNotLastSuperAdmin } from '../transitions/guards/user.guards.js';
import { runGuards } from '../transitions/runGuards.js';

type UserE = HydratedDocument<UserDoc>;

async function loadUserOrThrow(userId: string, session: ClientSession): Promise<UserE> {
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user;
}

// User.isActive is a boolean, not an enum, so it doesn't fit the generic
// transition() (which keys on a string field) — this follows the same five
// steps by hand: edge existence (isActive must currently be true/false as
// expected), guards, write, single audit row, all in one transaction.
export async function deactivateUser(userId: string, reason: string, actor: ActorContext): Promise<UserE> {
  if (!reason || !reason.trim()) {
    throw new ValidationError('A reason is required to deactivate a user.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required'] },
    });
  }
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const user = await loadUserOrThrow(userId, session);
      if (!user.isActive) {
        throw new GuardFailedError('User is already deactivated.', { guard: 'guardAccountCurrentlyActive' });
      }
      await runGuards([guardNotLastAdmin, guardNotLastSuperAdmin], user, actor, session);

      user.isActive = false;
      await user.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_DEACTIVATED',
            entityType: 'USER',
            entityId: user._id,
            previousState: 'ACTIVE',
            newState: 'INACTIVE',
            reason,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
      result = user;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function reactivateUser(userId: string, actor: ActorContext): Promise<UserE> {
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const user = await loadUserOrThrow(userId, session);
      if (user.isActive) {
        throw new GuardFailedError('User is already active.', { guard: 'guardAccountCurrentlyInactive' });
      }
      user.isActive = true;
      user.failedLoginCount = 0;
      user.set('lockedUntil', undefined);
      await user.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_REACTIVATED',
            entityType: 'USER',
            entityId: user._id,
            previousState: 'INACTIVE',
            newState: 'ACTIVE',
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
      result = user;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
