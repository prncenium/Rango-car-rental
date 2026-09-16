import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
import type { Role } from '@rango/shared';
import type { ActorContext } from '../lib/actor.js';
import { ConflictError, GuardFailedError, NotFoundError, ValidationError } from '../lib/errors.js';
import { User, type UserDoc } from '../models/User.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import {
  guardNotHigherPrivilege,
  guardNotLastAdmin,
  guardNotLastSuperAdmin,
} from '../transitions/guards/user.guards.js';
import { runGuards } from '../transitions/runGuards.js';

type UserE = HydratedDocument<UserDoc>;

async function loadUserOrThrow(userId: string, session: ClientSession): Promise<UserE> {
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user;
}

export interface AdminListUsersQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  role?: string[] | undefined;
  isActive?: boolean | undefined;
  q?: string | undefined;
}

const USERS_SORT_WHITELIST: Record<string, Record<string, 1 | -1>> = {
  'createdAt:desc': { createdAt: -1 },
  'name:asc': { name: 1 },
};

// spec 02 §4.3 — a user-supplied search string must never reach a regex
// unescaped.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// spec 02 E-57 — admin user list. No kycStatus filter here: D8 removed the
// KYC entity and User.kycStatus along with it, so the field the spec's
// original DTO filtered on no longer exists.
export async function adminListUsers(query: AdminListUsersQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;
  const sortKey = query.sort && USERS_SORT_WHITELIST[query.sort] ? query.sort : 'createdAt:desc';

  const filter: FilterQuery<UserDoc> = {};
  if (query.role?.length) {
    filter.role = { $in: query.role as Role[] };
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .sort({ ...USERS_SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}

// spec 02 E-58 — single-record admin read, no ownership scope (any admin may
// read any user). `passwordHash` stays excluded by the schema's own
// `select: false` (spec §1.1); nothing here re-selects it.
export async function adminGetUser(userId: string) {
  const user = await User.findById(userId).lean();
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
      await runGuards([guardNotHigherPrivilege, guardNotLastAdmin, guardNotLastSuperAdmin], user, actor, session);

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
      await runGuards([guardNotHigherPrivilege], user, actor, session);
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
