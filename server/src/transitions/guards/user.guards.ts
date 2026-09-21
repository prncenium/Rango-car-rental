import type { HydratedDocument } from 'mongoose';
import { User, type UserDoc } from '../../models/User.model.js';
import type { Guard } from './types.js';

type UserE = HydratedDocument<UserDoc>;

// design D11 — role checks are always `role in {ADMIN, SUPER_ADMIN}`, and
// the two tiers are counted independently so deactivating the last member of
// one tier can never silently strand its capability set, even while the
// other tier still has members.
export const guardNotLastAdmin: Guard<UserE> = {
  name: 'guardNotLastAdmin',
  check: async (entity, _actor, session) => {
    if (entity.role !== 'ADMIN' && entity.role !== 'SUPER_ADMIN') {
      return { ok: true };
    }
    const remaining = await User.countDocuments({
      _id: { $ne: entity._id },
      role: { $in: ['ADMIN', 'SUPER_ADMIN'] },
      isActive: true,
    }).session(session);
    if (remaining === 0) {
      return { ok: false, details: { reason: 'LAST_ADMIN' } };
    }
    return { ok: true };
  },
};

export const guardNotLastSuperAdmin: Guard<UserE> = {
  name: 'guardNotLastSuperAdmin',
  check: async (entity, _actor, session) => {
    if (entity.role !== 'SUPER_ADMIN') {
      return { ok: true };
    }
    const remaining = await User.countDocuments({
      _id: { $ne: entity._id },
      role: 'SUPER_ADMIN',
      isActive: true,
    }).session(session);
    if (remaining === 0) {
      return { ok: false, details: { reason: 'LAST_SUPER_ADMIN' } };
    }
    return { ok: true };
  },
};

// spec 03 §11.3/§11.4/§11.5 — the super-admin provisioning guards. These are
// checked explicitly by superAdmin.service.ts rather than through
// runGuards(), because the spec distinguishes a wrong-current-role case
// (409 INVALID_TRANSITION, checked before any guard) from an actual guard
// failure (409 GUARD_FAILED) — see each guard's call site.

// spec 03 §2.6/§11.6 — E-59/E-60/E-66 must carry a privilege-ordering guard no
// existing spec had. Without it, any ADMIN could deactivate/reactivate (or
// password-reset) a SUPER_ADMIN, since requireRole([ADMIN, SUPER_ADMIN])
// alone treats both tiers as equal at the route layer. Rank order:
// SUPER_ADMIN > ADMIN > USER. §11.6's resolved rule is `rank[actor] >=
// rank[target]` to ALLOW — i.e. refuse only when the target outranks the
// actor (rank[target] > rank[actor]). Peer action (one ADMIN acting on
// another, one SUPER_ADMIN acting on another) is deliberately allowed — it
// is the recovery path for a compromised peer account — and it is
// guardNotSelf plus the last-admin/last-super-admin guards that keep it from
// becoming self-destruction, not this guard (§11.6, OQ-A27's stated default).
const ROLE_RANK: Record<'USER' | 'ADMIN' | 'SUPER_ADMIN', number> = {
  USER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
};

export const guardNotHigherPrivilege: Guard<UserE> = {
  name: 'guardNotHigherPrivilege',
  check: (entity, actor) => {
    const actorRank = ROLE_RANK[actor.role as keyof typeof ROLE_RANK] ?? 0;
    const targetRank = ROLE_RANK[entity.role as keyof typeof ROLE_RANK] ?? 0;
    if (targetRank > actorRank) {
      return { ok: false, details: { reason: 'TARGET_HIGHER_PRIVILEGE', actorRole: actor.role, targetRole: entity.role } };
    }
    return { ok: true };
  },
};

export const guardNotSelf: Guard<UserE> = {
  name: 'guardNotSelf',
  check: (entity, actor) => {
    if (entity._id.equals(actor.userId)) {
      return { ok: false, details: { reason: 'CANNOT_ACT_ON_SELF' } };
    }
    return { ok: true };
  },
};

// E-68 — promotion targets must currently be a plain USER. Already
// ADMIN/SUPER_ADMIN is an INVALID_TRANSITION at the call site, not this
// guard's concern; this guard exists so the check is independently testable.
export const guardTargetIsUser: Guard<UserE> = {
  name: 'guardTargetIsUser',
  check: (entity) => {
    if (entity.role !== 'USER') {
      return { ok: false, details: { reason: 'TARGET_NOT_USER', role: entity.role } };
    }
    return { ok: true };
  },
};

// E-70 — promotion to SUPER_ADMIN is always a two-step path through ADMIN.
export const guardTargetIsAdmin: Guard<UserE> = {
  name: 'guardTargetIsAdmin',
  check: (entity) => {
    if (entity.role !== 'ADMIN') {
      return { ok: false, details: { reason: 'TARGET_NOT_ADMIN', role: entity.role } };
    }
    return { ok: true };
  },
};

// E-68/E-70 — a suspended account cannot be promoted.
export const guardTargetActive: Guard<UserE> = {
  name: 'guardTargetActive',
  check: (entity) => {
    if (!entity.isActive) {
      return { ok: false, details: { reason: 'TARGET_INACTIVE' } };
    }
    return { ok: true };
  },
};

// E-70 — `confirmEmail` is a deliberate type-the-address confirmation step
// for the single most consequential write in the platform (spec 03 §11.5).
// The value is carried in as a transient property on the loaded document
// (the same $locals convention booking.guards.ts's guardEffectiveFromValid
// uses) rather than widening the Guard signature for one call site.
export const guardConfirmEmailMatches: Guard<UserE> = {
  name: 'guardConfirmEmailMatches',
  check: (entity) => {
    const confirmEmail = (entity as unknown as { $locals?: { confirmEmail?: string } }).$locals?.confirmEmail;
    if (!confirmEmail || confirmEmail.trim().toLowerCase() !== entity.email.toLowerCase()) {
      return { ok: false, details: { reason: 'CONFIRM_EMAIL_MISMATCH' } };
    }
    return { ok: true };
  },
};
