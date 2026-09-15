import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { ConflictError, GuardFailedError, NotFoundError, ValidationError } from '../lib/errors.js';
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

// spec 02 E-25 — a record read, distinct from GET /api/auth/me's session/
// bootstrap concern (permissions, counts). No guards: every actor may always
// read their own profile.
export async function getProfile(actor: ActorContext): Promise<UserE> {
  const user = await User.findById(actor.userId);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user;
}

export interface UpdateProfileInput {
  name?: string | undefined;
  phone?: string | undefined;
}

// spec 02 E-26 — NONE of this touches a status field. Email, role, kycStatus,
// and isActive are absent from the DTO at the route layer (D10) and are never
// even parameters here. Phone is the only uniqueness-guarded field.
export async function updateProfile(actor: ActorContext, input: UpdateProfileInput): Promise<UserE> {
  if (input.name === undefined && input.phone === undefined) {
    throw new ValidationError('At least one field is required.', { source: 'body', fieldErrors: {} });
  }
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const user = await loadUserOrThrow(String(actor.userId), session);

      if (input.phone !== undefined && input.phone !== user.phone) {
        const conflict = await User.findOne({ phone: input.phone, _id: { $ne: user._id } }).session(session);
        if (conflict) {
          throw new ConflictError('This phone number is already in use.', { field: 'phone' });
        }
        user.phone = input.phone;
      }
      if (input.name !== undefined) {
        user.name = input.name;
      }
      await user.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_PROFILE_UPDATED',
            entityType: 'USER',
            entityId: user._id,
            metadata: { changedFields: Object.keys(input) },
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
