// One-off: deactivates a named account through the real deactivateUser()
// service (guards + audit row), acting as the platform's SUPER_ADMIN, rather
// than a raw isActive field edit.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { deactivateUser } from '../services/user.service.js';
import type { ActorContext } from '../lib/actor.js';

const ACTOR_EMAIL = 'rangocarrental@gmail.com';
const TARGET_EMAIL = 'admin@rangocars.local';
const REASON = 'Removed per operator request; consolidating to rangocarrental@gmail.com as the main admin.';

async function main(): Promise<void> {
  await connectDb();

  const actorUser = await User.findOne({ email: ACTOR_EMAIL });
  if (!actorUser) {
    console.error(`Actor account ${ACTOR_EMAIL} not found.`);
    process.exit(1);
  }
  const targetUser = await User.findOne({ email: TARGET_EMAIL });
  if (!targetUser) {
    console.error(`Target account ${TARGET_EMAIL} not found.`);
    process.exit(1);
  }

  const actor: ActorContext = { userId: actorUser._id, role: actorUser.role, isActive: actorUser.isActive };
  const result = await deactivateUser(String(targetUser._id), REASON, actor);
  console.log(`${TARGET_EMAIL} deactivated. isActive: ${result.isActive}`);

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
