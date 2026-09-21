// One-off: hard-deletes admin@rangocars.local's 7 leftover DRAFT/UNLISTED
// seed cars via the real deleteListing() service (owner-scoped, guarded:
// guardNeverModerated, guardNeverPublished, guardNoBookingsEver — exactly
// why these specific cars qualify: never submitted, never published, no
// booking history) rather than a raw Car.deleteOne, so the same
// CAR_DELETED audit trail the app itself would produce gets written.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { Car } from '../models/Car.model.js';
import { deleteListing } from '../services/car.service.js';
import type { ActorContext } from '../lib/actor.js';

const OWNER_EMAIL = 'admin@rangocars.local';

async function main(): Promise<void> {
  await connectDb();

  const owner = await User.findOne({ email: OWNER_EMAIL });
  if (!owner) {
    console.error(`No user found with email ${OWNER_EMAIL}.`);
    process.exit(1);
  }

  const actor: ActorContext = { userId: owner._id, role: owner.role, isActive: owner.isActive };
  const cars = await Car.find({ owner: owner._id, moderationStatus: 'DRAFT', listingState: 'UNLISTED' });

  if (cars.length === 0) {
    console.log('No matching DRAFT/UNLISTED cars found.');
    await mongoose.disconnect();
    return;
  }

  for (const car of cars) {
    const result = await deleteListing(String(car._id), actor);
    console.log(`Deleted ${car.make} ${car.model} (${car.registrationNumber}) — ${result.id}`);
  }

  console.log(`Done: ${cars.length} car(s) deleted.`);
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
