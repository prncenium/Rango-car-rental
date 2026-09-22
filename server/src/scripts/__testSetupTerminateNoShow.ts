// TEMP dev-only fixture script for manually testing the new
// terminate/clear-no-show admin UI. Drives real bookings through the actual
// service layer (requestBooking -> confirmBooking -> activateBooking /
// markNoShow) so every guard runs for real, exactly like quickSeedCars.ts.
// The one deliberate shortcut: booking B's startDate is backdated by a
// direct document write *after* it's confirmed, purely so guardStartDatePassed
// can be satisfied without waiting a real day — status itself is still
// reached only via the real markNoShow() transition. Local dev DB only.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { Car } from '../models/Car.model.js';
import { hashPassword } from '../lib/password.js';
import { requestBooking, confirmBooking, activateBooking, markNoShow } from '../services/booking.service.js';
import type { ActorContext } from '../lib/actor.js';

async function ensureRenter(email: string, name: string) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      phone: `+9198765${Math.floor(10000 + Math.random() * 89999)}`,
      passwordHash: await hashPassword('TestRenter@12345'),
      role: 'USER',
      isActive: true,
      drivingLicence: { number: `DLTEST${Math.floor(1000 + Math.random() * 8999)}`, enteredAt: new Date() },
    });
  }
  return user;
}

function actorFor(user: { _id: mongoose.Types.ObjectId; role: string; isActive: boolean }): ActorContext {
  return { userId: user._id, role: user.role as ActorContext['role'], isActive: user.isActive };
}

async function main(): Promise<void> {
  await connectDb();

  const admin = await User.findOne({ email: 'admin@rangocars.local' });
  if (!admin) throw new Error('Seeded admin not found — run resetAdminPassword.ts first.');
  const adminActor = actorFor(admin);

  const cars = await Car.find({ moderationStatus: 'APPROVED', listingState: 'LISTED' }).limit(2);
  if (cars.length < 2) throw new Error(`Need 2 APPROVED+LISTED cars, found ${cars.length}. Run quickSeedCars.ts first.`);

  const renterA = await ensureRenter('test-renter-a@example.com', 'Test Renter A');
  const renterB = await ensureRenter('test-renter-b@example.com', 'Test Renter B');

  const today = new Date().toISOString().slice(0, 10);
  const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  // Booking A -> ACTIVE (for "End rental early" / terminate)
  let bookingA = await requestBooking(actorFor(renterA), {
    carId: String(cars[0]!._id),
    startDate: today,
    endDate: inThreeDays,
    agreedToTerms: true,
  });
  bookingA = await confirmBooking(String(bookingA._id), adminActor);
  bookingA = await activateBooking(String(bookingA._id), adminActor, { overrideReason: 'test fixture — skipping payment guard' });

  // Booking B -> NO_SHOW (for "Clear no-show")
  let bookingB = await requestBooking(actorFor(renterB), {
    carId: String(cars[1]!._id),
    startDate: today,
    endDate: inThreeDays,
    agreedToTerms: true,
  });
  bookingB = await confirmBooking(String(bookingB._id), adminActor);
  // Backdate startDate directly so guardStartDatePassed is satisfiable today.
  bookingB.startDate = new Date(Date.now() - 86_400_000);
  await bookingB.save();
  bookingB = await markNoShow(String(bookingB._id), 'test fixture — renter never arrived', adminActor);

  console.log('Booking A (ACTIVE, for terminate test):', String(bookingA._id));
  console.log('Booking B (NO_SHOW, for clear-no-show test):', String(bookingB._id));

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
