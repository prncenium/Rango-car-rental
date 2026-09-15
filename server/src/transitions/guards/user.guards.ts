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
