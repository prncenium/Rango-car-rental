import mongoose, { type ClientSession, type HydratedDocument, Types } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { InvalidTransitionError, NotFoundError, ValidationError } from '../lib/errors.js';
import { User, type UserDoc } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { SystemConfig, type SystemConfigDoc } from '../models/SystemConfig.model.js';
import { Booking } from '../models/Booking.model.js';
import { runGuards } from '../transitions/runGuards.js';
import {
  guardConfirmEmailMatches,
  guardNotLastAdmin,
  guardNotLastSuperAdmin,
  guardNotSelf,
  guardTargetActive,
  guardTargetIsAdmin,
  guardTargetIsUser,
} from '../transitions/guards/user.guards.js';

type UserE = HydratedDocument<UserDoc>;

// AuditLog.entityId is a strict ObjectId (not a strict ref, but still cast
// as one — server/src/models/AuditLog.model.ts) while SystemConfig's own id
// is the fixed string 'singleton'. This sentinel is the one stable,
// valid-format id the singleton's audit rows can point at.
const SYSTEM_CONFIG_AUDIT_ENTITY_ID = new Types.ObjectId('000000000000000000000001');

async function loadTargetOrThrow(userId: string, session: ClientSession): Promise<UserE> {
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user;
}

// spec 03 §4.5's revocation-triggers table: any role change revokes every
// session of the target so a stale token's `role` claim can never outlive
// the account's actual authority (design §4.6 closes the rest of the gap on
// /api/admin and /api/superadmin via the per-request Session re-read).
async function revokeAllSessions(userId: UserE['_id'], session: ClientSession): Promise<void> {
  await Session.updateMany(
    { user: userId, status: 'ACTIVE' },
    { $set: { status: 'REVOKED', revokedReason: 'ADMIN_REVOKED' } },
  ).session(session);
}

// spec 03 §11.3 E-68 — USER -> ADMIN. Promotion is by userId only, never by
// email (a typo-email promotion would hand moderation authority to the
// wrong account).
export async function promoteToAdmin(userId: string, reason: string, actor: ActorContext): Promise<UserE> {
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const target = await loadTargetOrThrow(userId, session);
      if (target.role !== 'USER') {
        throw new InvalidTransitionError('User already holds admin authority.', {
          from: target.role,
          to: 'ADMIN',
        });
      }
      await runGuards([guardNotSelf, guardTargetIsUser, guardTargetActive], target, actor, session);

      target.role = 'ADMIN';
      await target.save({ session });
      await revokeAllSessions(target._id, session);

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_PROMOTED_TO_ADMIN',
            entityType: 'USER',
            entityId: target._id,
            previousState: 'USER',
            newState: 'ADMIN',
            reason,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
      result = target;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 03 §11.4 E-69 — ADMIN|SUPER_ADMIN -> USER.
export async function demoteAdmin(userId: string, reason: string, actor: ActorContext): Promise<UserE> {
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const target = await loadTargetOrThrow(userId, session);
      if (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN') {
        throw new InvalidTransitionError('User already holds no admin authority.', {
          from: target.role,
          to: 'USER',
        });
      }
      const previousRole = target.role;
      await runGuards([guardNotSelf, guardNotLastSuperAdmin, guardNotLastAdmin], target, actor, session);

      target.role = 'USER';
      await target.save({ session });
      await revokeAllSessions(target._id, session);

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_DEMOTED_FROM_ADMIN',
            entityType: 'USER',
            entityId: target._id,
            previousState: previousRole,
            newState: 'USER',
            reason,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
      result = target;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 03 §11.5 E-70 — ADMIN -> SUPER_ADMIN. The single most consequential
// write in the platform (the new SUPER_ADMIN can demote whoever promoted
// them), so it is always a deliberate two-step path through ADMIN and
// requires typing the target's email to confirm.
export async function promoteToSuperAdmin(
  userId: string,
  reason: string,
  confirmEmail: string,
  actor: ActorContext,
): Promise<UserE> {
  const session = await mongoose.startSession();
  try {
    let result!: UserE;
    await session.withTransaction(async () => {
      const target = await loadTargetOrThrow(userId, session);
      if (target.role !== 'ADMIN') {
        throw new InvalidTransitionError('Promotion to super-admin requires the user to already be an admin.', {
          from: target.role,
          to: 'SUPER_ADMIN',
        });
      }
      // Carried in for guardConfirmEmailMatches, following the same
      // transient-$locals convention booking.guards.ts's
      // guardEffectiveFromValid uses to pass caller-supplied input a Guard
      // otherwise has no signature for.
      (target as unknown as { $locals: Record<string, unknown> }).$locals.confirmEmail = confirmEmail;
      await runGuards(
        [guardNotSelf, guardTargetIsAdmin, guardTargetActive, guardConfirmEmailMatches],
        target,
        actor,
        session,
      );

      target.role = 'SUPER_ADMIN';
      await target.save({ session });
      await revokeAllSessions(target._id, session);

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'USER_PROMOTED_TO_SUPER_ADMIN',
            entityType: 'USER',
            entityId: target._id,
            previousState: 'ADMIN',
            newState: 'SUPER_ADMIN',
            reason,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
      result = target;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 03 §11.8 E-71 — read the singleton, falling back to the schema
// defaults if it has never been written (same convention as
// lib/systemConfig.ts's per-guard readers).
export async function getSystemConfig(): Promise<SystemConfigDoc> {
  const config = await SystemConfig.findById('singleton').lean();
  if (config) {
    return config;
  }
  const defaults = new SystemConfig({ _id: 'singleton' });
  return defaults.toObject();
}

type LooseOptional<T> = { [K in keyof T]?: T[K] | undefined };

export interface SystemConfigPatch {
  booking?: LooseOptional<SystemConfigDoc['booking']> | undefined;
  availability?: LooseOptional<SystemConfigDoc['availability']> | undefined;
  security?: LooseOptional<SystemConfigDoc['security']> | undefined;
  listing?: LooseOptional<SystemConfigDoc['listing']> | undefined;
  platform?: LooseOptional<SystemConfigDoc['platform']> | undefined;
}

interface ChangedKey {
  key: string;
  previousValue: unknown;
  newValue: unknown;
}

// spec 04 §1.5 — a config change is prospective only; existing
// BookingDayLock rows (and the bookings holding them) are never rewritten.
// booking.turnaroundBufferDays is the one key whose change leaves existing
// state visibly "stale" (a booking confirmed under the old buffer keeps the
// locks it was confirmed with), so E-72's response must say how many
// in-flight bookings are unaffected by the new value.
async function countBookingsUnaffectedByBufferChange(session: ClientSession): Promise<number> {
  return Booking.countDocuments({
    status: { $in: ['CONFIRMED', 'ACTIVE', 'CANCELLATION_REQUESTED'] },
  }).session(session);
}

// spec 03 §11.8 E-72 — no key here may change an authorization rule (roles,
// the permission matrix, guards are code and spec, never configuration);
// every changed leaf gets its own audit row entry.
export async function updateSystemConfig(
  patch: SystemConfigPatch,
  actor: ActorContext,
): Promise<{ config: SystemConfigDoc; bookingsUnaffectedByBufferChange: number | null }> {
  if (
    !patch.booking &&
    !patch.availability &&
    !patch.security &&
    !patch.listing &&
    !patch.platform
  ) {
    throw new ValidationError('At least one field is required.', { source: 'body', fieldErrors: {} });
  }

  const session = await mongoose.startSession();
  try {
    let config!: SystemConfigDoc;
    let bookingsUnaffectedByBufferChange: number | null = null;

    await session.withTransaction(async () => {
      const existing =
        (await SystemConfig.findById('singleton').session(session)) ?? new SystemConfig({ _id: 'singleton' });

      const changed: ChangedKey[] = [];
      for (const section of ['booking', 'availability', 'security', 'listing', 'platform'] as const) {
        const sectionPatch = patch[section];
        if (!sectionPatch) continue;
        for (const [field, newValue] of Object.entries(sectionPatch)) {
          if (newValue === undefined) continue;
          const current = (existing[section] as Record<string, unknown>)[field];
          if (current !== newValue) {
            changed.push({ key: `${section}.${field}`, previousValue: current, newValue });
          }
          (existing[section] as Record<string, unknown>)[field] = newValue;
        }
      }

      if (changed.length === 0) {
        config = existing.toObject();
        return;
      }

      await existing.save({ session });

      if (patch.booking?.turnaroundBufferDays !== undefined) {
        bookingsUnaffectedByBufferChange = await countBookingsUnaffectedByBufferChange(session);
      }

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'SYSTEM_CONFIG_CHANGED',
            entityType: 'SYSTEM_CONFIG',
            entityId: SYSTEM_CONFIG_AUDIT_ENTITY_ID,
            metadata: { changed },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      config = existing.toObject();
    });

    return { config, bookingsUnaffectedByBufferChange };
  } finally {
    await session.endSession();
  }
}
