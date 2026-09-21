// Dev-only: sets a known password on the seeded admin account so it can be logged into locally.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { hashPassword } from '../lib/password.js';

const EMAIL = 'admin@rangocars.local';
const NEW_PASSWORD = 'Admin@12345';

async function main(): Promise<void> {
  await connectDb();
  const passwordHash = await hashPassword(NEW_PASSWORD);
  const result = await User.updateOne({ email: EMAIL }, { $set: { passwordHash } });
  if (result.matchedCount === 0) {
    console.error(`No user found with email ${EMAIL}`);
    process.exit(1);
  }
  console.log(`Password reset for ${EMAIL}. New password: ${NEW_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
