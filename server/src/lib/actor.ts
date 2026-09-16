import type { Types } from 'mongoose';
import type { Role } from '@rango/shared';

// design §8 — the discriminated actor the whole transition layer operates
// against. Re-read from the database at the edge (middleware/auth.ts), never
// trusted from the token alone, because a guard's decision must be current
// (spec 02 §6.1).
export interface ActorContext {
  userId: Types.ObjectId;
  role: Role;
  isActive: boolean;
  ip?: string | undefined;
  // Session._id from the access token's `sid` claim (spec 03 §4.4). Used by
  // requireActiveSession (middleware/auth.ts) to close the access-token
  // revocation gap on /api/admin and /api/superadmin (spec 03 §4.5 option b).
  sessionId?: Types.ObjectId | undefined;
}

export function isAdminActor(actor: ActorContext): boolean {
  return actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';
}

export function isSuperAdminActor(actor: ActorContext): boolean {
  return actor.role === 'SUPER_ADMIN';
}
