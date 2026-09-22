// One-off dev convenience script — NOT part of the formal OPS-01 seed task.
// Creates real Car listings end-to-end through the actual service layer
// (createListing -> addListingImages -> submitListing -> approveCar ->
// publishCar), so every guard and the admin-approval gate (INV-1) still
// runs for real. Nothing here writes a status field directly.
//
// Usage:
//   1. Edit OWNER_EMAIL below to the email you registered as the owner.
//   2. Edit the CARS array: one entry per car, with make/model/year and each
//      photo as either a local file path or an already-hosted image URL
//      (e.g. a Cloudinary link) — both are supported per entry.
//   3. From server/: npx tsx src/scripts/quickSeedCars.ts
//
// Everything not listed per-car (color, transmission, fuel type, seats,
// mileage, location, pricing, description) is filled with reasonable
// placeholder values — edit the DEFAULTS block if you want different ones.

import fs from 'node:fs';
import path from 'node:path';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.model.js';
import { Car } from '../models/Car.model.js';
import type { ActorContext } from '../lib/actor.js';
import { createListing, addListingImages, submitListing, approveCar, publishCar } from '../services/car.service.js';

const OWNER_EMAIL = 'rangocarrental@gmail.com'; // <-- change to the account you registered

interface CarSpec {
  make: string;
  model: string;
  year: number;
  images: string[]; // absolute or relative-to-this-file local file paths
  color?: string;
  transmission?: 'MANUAL' | 'AUTOMATIC';
  fuelType?: 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'CNG';
  seats?: number;
  mileageKm?: number;
  rentalPricePerDay?: number;
  /** From the operator's rate card, per model — see docs/legal or the rate-card image. */
  depositAmount?: number;
  /** ₹/km charged beyond the 300km/day cap (specs/04-business-logic.md §2.2a). */
  extraKmRatePerKm?: number;
  city?: string;
  state?: string;
  description?: string;
}

// Weekly rate must be strictly less than 7x the daily rate (shared/src/dto/car.ts's
// own validation) — the operator wants "no weekly discount, just daily x 7", so this
// is the closest legal value to that (1 rupee under, functionally identical).
function flatWeeklyRate(dailyRate: number): number {
  return dailyRate * 7 - 1;
}

// ---- EDIT THIS LIST -------------------------------------------------------
const CARS: CarSpec[] = [
  {
    make: 'Volkswagen',
    model: 'Virtus',
    year: 2022,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891783/IMG_4503.JPG.jpg'],
    color: 'Blue',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    rentalPricePerDay: 8000,
    depositAmount: 10000,
    extraKmRatePerKm: 20,
  },
  {
    make: 'Maruti Suzuki',
    model: 'Swift',
    year: 2021,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891782/IMG_4507.JPG.jpg'],
    fuelType: 'PETROL',
    transmission: 'MANUAL',
    rentalPricePerDay: 4000,
    depositAmount: 5000,
    extraKmRatePerKm: 12,
  },
  {
    make: 'Maruti',
    model: 'Brezza',
    year: 2022,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891782/IMG_4502.JPG.jpg'],
    fuelType: 'PETROL',
    transmission: 'MANUAL',
    seats: 5,
    rentalPricePerDay: 5000,
    depositAmount: 5000,
    extraKmRatePerKm: 15,
  },
  {
    make: 'Mahindra',
    model: 'Thar',
    year: 2023,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891782/IMG_4508.JPG.jpg'],
    fuelType: 'DIESEL',
    transmission: 'MANUAL',
    seats: 4,
    rentalPricePerDay: 8000,
    depositAmount: 10000,
    extraKmRatePerKm: 20,
  },
  {
    make: 'Honda',
    model: 'City',
    year: 2021,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891783/IMG_4505.JPG.jpg'],
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    rentalPricePerDay: 4000,
    depositAmount: 4000,
    extraKmRatePerKm: 15,
  },
  {
    make: 'Kia',
    model: 'Sonet',
    year: 2022,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891783/IMG_4506.JPG.jpg'],
    fuelType: 'PETROL',
    transmission: 'MANUAL',
    rentalPricePerDay: 5000,
    depositAmount: 5000,
    extraKmRatePerKm: 15,
  },
  {
    make: 'Maruti',
    model: 'Grand Vitara',
    year: 2023,
    images: ['https://res.cloudinary.com/gitn9iob/image/upload/v1789891783/IMG_4504.JPG.jpg'],
    fuelType: 'HYBRID',
    transmission: 'AUTOMATIC',
    rentalPricePerDay: 5000,
    depositAmount: 5000,
    extraKmRatePerKm: 15,
  },
];
// ---------------------------------------------------------------------------

const DEFAULTS = {
  transmission: 'AUTOMATIC' as const,
  fuelType: 'PETROL' as const,
  seats: 5,
  mileageKm: 32000,
  rentalPricePerDay: 3500,
  city: 'Gandhinagar, Ahmedabad',
  state: 'Gujarat',
};

function randomPlate(): string {
  const states = ['MH', 'DL', 'KA', 'TN', 'GJ', 'UP', 'RJ', 'WB', 'PB', 'HR'];
  const state = states[Math.floor(Math.random() * states.length)];
  const district = String(Math.floor(Math.random() * 60) + 1).padStart(2, '0');
  const letters = Array.from({ length: 2 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const number = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `${state}${district}${letters}${number}`;
}

function defaultDescription(spec: CarSpec): string {
  return `Well-maintained ${spec.make} ${spec.model} (${spec.year}) in great condition, regularly serviced with all documents in order. Comfortable, reliable, and ready for your next trip.`;
}

async function main() {
  await connectDb();

  const owner = await User.findOne({ email: OWNER_EMAIL.toLowerCase() });
  if (!owner) {
    throw new Error(`No user found with email ${OWNER_EMAIL}. Register that account first.`);
  }
  const admin = await User.findOne({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] } });
  if (!admin) {
    throw new Error('No ADMIN/SUPER_ADMIN user found in the database.');
  }

  const ownerActor: ActorContext = { userId: owner._id, role: owner.role, isActive: owner.isActive };
  const adminActor: ActorContext = { userId: admin._id, role: admin.role, isActive: admin.isActive };

  for (const spec of CARS) {
    console.log(`\n--- ${spec.make} ${spec.model} (${spec.year}) ---`);

    const car = await createListing(ownerActor, {
      make: spec.make,
      model: spec.model,
      year: spec.year,
      registrationNumber: randomPlate(),
      color: spec.color,
      transmission: spec.transmission ?? DEFAULTS.transmission,
      fuelType: spec.fuelType ?? DEFAULTS.fuelType,
      seats: spec.seats ?? DEFAULTS.seats,
      mileageKm: spec.mileageKm ?? DEFAULTS.mileageKm,
      images: [],
      description: spec.description ?? defaultDescription(spec),
      location: { city: spec.city ?? DEFAULTS.city, state: spec.state ?? DEFAULTS.state },
      rentalPricePerDay: spec.rentalPricePerDay ?? DEFAULTS.rentalPricePerDay,
      rentalPricePerWeek: flatWeeklyRate(spec.rentalPricePerDay ?? DEFAULTS.rentalPricePerDay),
      depositAmount: spec.depositAmount,
      extraKmRatePerKm: spec.extraKmRatePerKm,
    });
    console.log(`created draft ${car.id} (${car.registrationNumber})`);

    const urlImages = spec.images.filter((i) => /^https?:\/\//i.test(i));
    const fileImages = spec.images.filter((i) => !/^https?:\/\//i.test(i));

    if (urlImages.length > 0) {
      await Car.updateOne({ _id: car.id }, { $push: { images: { $each: urlImages } } });
      console.log(`attached ${urlImages.length} hosted image URL(s)`);
    }
    if (fileImages.length > 0) {
      const files = fileImages.map((p) => {
        const resolved = path.resolve(p);
        const buffer = fs.readFileSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
        const mimetype = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return { buffer, mimetype };
      });
      await addListingImages(car.id, ownerActor, files);
      console.log(`uploaded ${files.length} local image(s)`);
    }

    await submitListing(car.id, ownerActor);
    await approveCar(car.id, adminActor);
    await publishCar(car.id, adminActor);
    console.log('approved and published — now public');
  }

  console.log(`\nDone: ${CARS.length} car(s) published.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
