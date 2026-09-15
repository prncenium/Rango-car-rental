import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { User } from '../../src/models/User.model.js';
import { Car } from '../../src/models/Car.model.js';
import { BookingDayLock } from '../../src/models/BookingDayLock.model.js';
import type { CarModerationStatus, CarListingState } from '@rango/shared';

async function makeOwner() {
  return User.create({
    name: 'Owner',
    email: `owner-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    passwordHash: 'not-a-real-hash',
    role: 'USER',
    isActive: true,
    drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
  });
}

async function makeCar(
  ownerId: string,
  moderationStatus: CarModerationStatus,
  listingState: CarListingState,
  overrides: Record<string, unknown> = {},
) {
  return Car.create({
    owner: ownerId,
    make: 'Toyota',
    model: 'Corolla',
    year: 2022,
    registrationNumber: `REG${Math.floor(Math.random() * 1e6)}`,
    transmission: 'MANUAL',
    fuelType: 'PETROL',
    seats: 5,
    mileageKm: 10000,
    images: ['https://example.com/a.jpg'],
    location: { city: 'Pune', state: 'MH' },
    rentalPricePerDay: 1000,
    moderationStatus,
    listingState,
    publishedAt: listingState === 'LISTED' ? new Date() : undefined,
    ...overrides,
  });
}

const ALL_COMBINATIONS: [CarModerationStatus, CarListingState][] = [
  ['DRAFT', 'UNLISTED'],
  ['PENDING_APPROVAL', 'UNLISTED'],
  ['REJECTED', 'UNLISTED'],
  ['APPROVED', 'UNLISTED'],
  ['APPROVED', 'LISTED'],
  ['APPROVED', 'DELISTED'],
];

describe('Public endpoints (/api/public/*)', () => {
  describe('GET /api/public/cars', () => {
    it('returns exactly the one car that is APPROVED and LISTED, across every moderation x listing combination', async () => {
      const owner = await makeOwner();
      for (const [moderationStatus, listingState] of ALL_COMBINATIONS) {
        await makeCar(String(owner._id), moderationStatus, listingState);
      }

      const res = await request(app).get('/api/public/cars');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBeDefined();
    });

    it('never exposes owner, registrationNumber, moderationStatus, or listingState', async () => {
      const owner = await makeOwner();
      await makeCar(String(owner._id), 'APPROVED', 'LISTED');

      const res = await request(app).get('/api/public/cars');

      expect(res.status).toBe(200);
      const summary = res.body.data[0];
      expect(summary.owner).toBeUndefined();
      expect(summary.registrationNumber).toBeUndefined();
      expect(summary.moderationStatus).toBeUndefined();
      expect(summary.listingState).toBeUndefined();
    });

    it('rejects an unknown query parameter, including moderationStatus/listingState/ownerId', async () => {
      const res = await request(app).get('/api/public/cars').query({ moderationStatus: 'APPROVED' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects availableFrom without availableTo', async () => {
      const res = await request(app).get('/api/public/cars').query({ availableFrom: '2026-10-01' });
      expect(res.status).toBe(400);
    });

    it('excludes a car with a locked day inside the requested availability window', async () => {
      const owner = await makeOwner();
      const car = await makeCar(String(owner._id), 'APPROVED', 'LISTED');
      await BookingDayLock.create({
        car: car._id,
        day: new Date('2026-10-02T00:00:00.000Z'),
        source: 'ADMIN_BLOCK',
        blockId: 'blk1',
        reason: 'maintenance',
        createdBy: owner._id,
      });

      const blocked = await request(app)
        .get('/api/public/cars')
        .query({ availableFrom: '2026-10-01', availableTo: '2026-10-05' });
      expect(blocked.body.data).toHaveLength(0);

      const free = await request(app)
        .get('/api/public/cars')
        .query({ availableFrom: '2026-11-01', availableTo: '2026-11-05' });
      expect(free.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/public/cars/:carId', () => {
    it('returns 200 for an APPROVED+LISTED car', async () => {
      const owner = await makeOwner();
      const car = await makeCar(String(owner._id), 'APPROVED', 'LISTED');

      const res = await request(app).get(`/api/public/cars/${car._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(String(car._id));
      expect(res.body.data.owner).toBeUndefined();
    });

    it.each(ALL_COMBINATIONS.filter(([m, l]) => !(m === 'APPROVED' && l === 'LISTED')))(
      'returns identical 404 for a non-public car (%s / %s)',
      async (moderationStatus, listingState) => {
        const owner = await makeOwner();
        const car = await makeCar(String(owner._id), moderationStatus, listingState);

        const res = await request(app).get(`/api/public/cars/${car._id}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      },
    );

    it('returns 404 for a nonexistent id, identical in shape to an unlisted car', async () => {
      const res = await request(app).get('/api/public/cars/507f1f77bcf86cd799439011');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/public/cars/:carId/availability', () => {
    it('reflects BookingDayLock rows, never a stored status field', async () => {
      const owner = await makeOwner();
      const car = await makeCar(String(owner._id), 'APPROVED', 'LISTED');
      await BookingDayLock.create([
        { car: car._id, day: new Date('2026-10-02T00:00:00.000Z'), source: 'BOOKING', booking: owner._id, createdBy: owner._id },
        { car: car._id, day: new Date('2026-10-03T00:00:00.000Z'), source: 'BOOKING', booking: owner._id, createdBy: owner._id },
      ]);

      const res = await request(app)
        .get(`/api/public/cars/${car._id}/availability`)
        .query({ from: '2026-10-01', to: '2026-10-05' });

      expect(res.status).toBe(200);
      expect(res.body.data.blockedDays).toEqual(['2026-10-02', '2026-10-03']);
      expect(res.body.data.blockedRanges).toEqual([{ from: '2026-10-02', to: '2026-10-04' }]);
      expect(res.body.data.bookingId).toBeUndefined();
    });

    it('404s for a non-public car', async () => {
      const owner = await makeOwner();
      const car = await makeCar(String(owner._id), 'APPROVED', 'UNLISTED');

      const res = await request(app)
        .get(`/api/public/cars/${car._id}/availability`)
        .query({ from: '2026-10-01', to: '2026-10-05' });
      expect(res.status).toBe(404);
    });

    it('rejects a window longer than 180 days', async () => {
      const owner = await makeOwner();
      const car = await makeCar(String(owner._id), 'APPROVED', 'LISTED');

      const res = await request(app)
        .get(`/api/public/cars/${car._id}/availability`)
        .query({ from: '2026-01-01', to: '2026-12-01' });
      expect(res.status).toBe(400);
    });
  });
});
