// One-off content-correction script (like quickSeedCars.ts) — updates
// model name and description text on already-published cars directly via
// Mongoose, bypassing the owner-edit service (which only allows editing
// DRAFT/REJECTED listings by design — INV-1's re-moderation guarantee).
// This only touches display copy (model, description), never a status
// field, so it doesn't need admin re-approval.
//
// Usage: from server/, npx tsx src/scripts/updateCarSpecs.ts
// Run it once against whichever DB MONGODB_URI (in server/.env) points at.

import { connectDb } from '../config/db.js';
import { Car } from '../models/Car.model.js';
import mongoose from 'mongoose';

interface Update {
  make: string;
  model: string; // current model, to find the car
  newModel?: string; // set if the model name itself should change
  extraLines: string[]; // appended to the existing description
}

const UPDATES: Update[] = [
  {
    make: 'Maruti Suzuki',
    model: 'Vitara Brezza',
    newModel: 'Brezza',
    extraLines: ['Fuel - CNG+ petrol', 'Mileage - 20-25kmpl'],
  },
  {
    make: 'Mahindra',
    model: 'Thar',
    newModel: 'Thar 4x2',
    extraLines: ['Mileage - 10-17kmpl'],
  },
  {
    make: 'Volkswagen',
    model: 'Virtus',
    extraLines: ['Mileage - 12-18kmpl'],
  },
  {
    make: 'Kia',
    model: 'Sonet',
    extraLines: ['Mileage - 15-20kmpl'],
  },
  {
    make: 'Honda',
    model: 'City',
    extraLines: ['Mileage - 20-30kmpl'],
  },
  {
    make: 'Maruti Suzuki',
    model: 'Swift',
    extraLines: ['Mileage - 20-25kmpl'],
  },
];

const NEW_LOCATION = { city: 'Gandhinagar, Ahmedabad', state: 'Gujarat' };

async function main() {
  await connectDb();

  for (const update of UPDATES) {
    const car = await Car.findOne({ make: update.make, model: update.model });
    if (!car) {
      console.warn(`SKIP: no car found for ${update.make} ${update.model}`);
      continue;
    }

    const existingLines = (car.description ?? '').split('\n').filter((line) => !update.extraLines.includes(line));
    const description = [...existingLines, ...update.extraLines].join('\n').trim();
    await Car.updateOne(
      { _id: car._id },
      { $set: { description, ...(update.newModel ? { model: update.newModel } : {}) } },
    );

    console.log(`Updated ${update.make} ${update.newModel ?? update.model} (${car._id})`);
  }

  // Every car's location, including the 7th (Grand Vitara) which has no
  // model/description change above — the location move applies to the
  // whole fleet, not just the 6 cars with mileage/name edits.
  const { modifiedCount } = await Car.updateMany({}, { $set: { location: NEW_LOCATION } });
  console.log(`Updated location on ${modifiedCount} car(s) to "${NEW_LOCATION.city}, ${NEW_LOCATION.state}".`);

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
