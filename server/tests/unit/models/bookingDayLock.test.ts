import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { BookingDayLock } from '../../../src/models/BookingDayLock.model.js';

describe('BookingDayLock model (D5)', () => {
  it('throws E11000 at the database when two locks target the same (car, day)', async () => {
    const car = new mongoose.Types.ObjectId();
    const day = new Date('2026-10-01T00:00:00Z');
    const createdBy = new mongoose.Types.ObjectId();
    const booking = new mongoose.Types.ObjectId();

    await BookingDayLock.create({ car, day, source: 'BOOKING', booking, createdBy });
    await expect(
      BookingDayLock.create({ car, day, source: 'BOOKING', booking, createdBy }),
    ).rejects.toThrow(/E11000/);
  });

  it('allows locks for the same car on different days', async () => {
    const car = new mongoose.Types.ObjectId();
    const createdBy = new mongoose.Types.ObjectId();
    const booking = new mongoose.Types.ObjectId();

    await BookingDayLock.create({
      car,
      day: new Date('2026-10-01T00:00:00Z'),
      source: 'BOOKING',
      booking,
      createdBy,
    });
    await expect(
      BookingDayLock.create({
        car,
        day: new Date('2026-10-02T00:00:00Z'),
        source: 'BOOKING',
        booking,
        createdBy,
      }),
    ).resolves.toBeDefined();
  });

  it('has the unique {car, day} index', async () => {
    const indexes = await BookingDayLock.collection.indexes();
    const carDay = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ car: 1, day: 1 }));
    expect(carDay).toBeDefined();
    expect(carDay!.unique).toBe(true);
  });
});
