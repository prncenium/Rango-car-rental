// One-off: promotes an existing registered account to SUPER_ADMIN.
// Not a general-purpose bootstrap (that's seedSuperAdmin.ts, spec 03 §11.2,
// which only ever creates a brand-new account) — this is for the specific
// case of designating an already-registered account as the platform's main
// admin, which the normal API path can't do on its own since it requires an
// existing SUPER_ADMIN caller (chicken-and-egg, same as the bootstrap problem
// §11.1 describes) and none currently exists.
//
// Mirrors the real two-step promotion path (USER -> ADMIN -> SUPER_ADMIN,
// spec 03 §11.3/§11.5) and its audit trail, rather than writing `role`
// directly — self-referential actor on both rows, same convention
// SUPER_ADMIN_SEEDED uses for a bootstrap action with no prior actor.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { AuditLog } from '../models/AuditLog.model.js';

const EMAIL = 'rangocarrental@gmail.com';

async function main(): Promise<void> {
  await connectDb();

  const user = await User.findOne({ email: EMAIL });
  if (!user) {
    console.error(`No user found with email ${EMAIL}.`);
    process.exit(1);
  }
  if (user.role === 'SUPER_ADMIN') {
    console.log(`${EMAIL} is already SUPER_ADMIN. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fromRole = user.role;

      if (fromRole === 'USER') {
        user.role = 'ADMIN';
        await user.save({ session });
        await AuditLog.create(
          [
            {
              actor: user._id,
              actorRole: 'ADMIN',
              action: 'USER_PROMOTED_TO_ADMIN',
              entityType: 'USER',
              entityId: user._id,
              previousState: 'USER',
              newState: 'ADMIN',
              reason: 'Designated as the platform main admin (manual bootstrap promotion).',
            },
          ],
          { session },
        );
      }

      user.role = 'SUPER_ADMIN';
      await user.save({ session });
      await AuditLog.create(
        [
          {
            actor: user._id,
            actorRole: 'SUPER_ADMIN',
            action: 'USER_PROMOTED_TO_SUPER_ADMIN',
            entityType: 'USER',
            entityId: user._id,
            previousState: 'ADMIN',
            newState: 'SUPER_ADMIN',
            reason: 'Designated as the platform main admin (manual bootstrap promotion).',
          },
        ],
        { session },
      );

      // spec 03 §4.5's revocation-triggers table — any role change revokes
      // every active session of the target so a stale token's `role` claim
      // can never outlive the account's actual authority.
      await Session.updateMany(
        { user: user._id, status: 'ACTIVE' },
        { $set: { status: 'REVOKED', revokedReason: 'ADMIN_REVOKED' } },
      ).session(session);
    });

    console.log(`${EMAIL} (${user._id}) is now SUPER_ADMIN.`);
  } finally {
    await session.endSession();
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
