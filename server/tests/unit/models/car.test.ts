import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Car } from '../../../src/models/Car.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    owner: new mongoose.Types.ObjectId(),
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    registrationNumber: 'KA01AB1234',
    transmission: 'MANUAL',
    fuelType: 'PETROL',
    seats: 5,
    mileageKm: 15000,
    images: ['https://example.com/car.jpg'],
    location: { city: 'Bengaluru', state: 'Karnataka' },
    rentalPricePerDay: 1200,
    ...overrides,
  };
}

describe('Car model (D2/D3)', () => {
  it('allows two DRAFT cars to share a registration plate', async () => {
    await Car.create(fixture({ moderationStatus: 'DRAFT' }));
    await expect(Car.create(fixture({ moderationStatus: 'DRAFT' }))).resolves.toBeDefined();
  });

  it('blocks two submitted (non-DRAFT) cars from sharing a plate', async () => {
    await Car.create(fixture({ moderationStatus: 'PENDING_APPROVAL' }));
    await expect(Car.create(fixture({ moderationStatus: 'APPROVED' }))).rejects.toThrow(/E11000/);
  });

  it('lets a draft coexist with an already-submitted car on the same plate, since a draft reserves nothing', async () => {
    await Car.create(fixture({ moderationStatus: 'PENDING_APPROVAL' }));
    await expect(Car.create(fixture({ moderationStatus: 'DRAFT' }))).resolves.toBeDefined();
  });

  it('rejects a geo point with a type but no coordinates', async () => {
    await expect(
      Car.create(
        fixture({
          location: { city: 'Bengaluru', state: 'Karnataka', geo: { type: 'Point' } },
        }),
      ),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('accepts a geo point with type and coordinates together', async () => {
    await expect(
      Car.create(
        fixture({
          location: {
            city: 'Bengaluru',
            state: 'Karnataka',
            geo: { type: 'Point', coordinates: [77.5946, 12.9716] },
          },
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('defaults moderationStatus to DRAFT and listingState to UNLISTED', async () => {
    const car = await Car.create(fixture());
    expect(car.moderationStatus).toBe('DRAFT');
    expect(car.listingState).toBe('UNLISTED');
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await Car.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ registrationNumber: 1 }));
    expect(keys).toContain(JSON.stringify({ owner: 1 }));
    expect(keys).toContain(JSON.stringify({ owner: 1, moderationStatus: 1 }));
    expect(keys).toContain(JSON.stringify({ moderationStatus: 1, listingState: 1 }));
  });
});
