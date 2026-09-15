import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { User } from '../../src/models/User.model.js';
import { Car } from '../../src/models/Car.model.js';
import { Booking } from '../../src/models/Booking.model.js';
import { AuditLog } from '../../src/models/AuditLog.model.js';

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signAccessToken(payload: { sub: string; role: string; isActive: boolean }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, jti: 'test-jti' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlEncode(createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

async function makeUser(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER') {
  const user = await User.create({
    name: 'Test User',
    email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    passwordHash: 'not-a-real-hash',
    role,
    isActive: true,
    drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
  });
  return { user, token: signAccessToken({ sub: String(user._id), role, isActive: true }) };
}

function validListingBody(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

async function makeCar(ownerId: string, overrides: Partial<Record<string, unknown>> = {}) {
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
    moderationStatus: 'DRAFT',
    listingState: 'UNLISTED',
    ...overrides,
  });
}

describe('User endpoints (/api/user/*)', () => {
  describe('Listings', () => {
    it('creates a DRAFT listing owned by the caller, ignoring any owner/status in the body', async () => {
      const { user, token } = await makeUser();
      const res = await request(app)
        .post('/api/user/listings')
        .set('Cookie', [`rgo_at=${token}`])
        .send(validListingBody());
      expect(res.status).toBe(201);
      expect(res.body.data.moderationStatus).toBe('DRAFT');
      expect(res.body.data.listingState).toBe('UNLISTED');
      expect(res.body.data.owner).toBe(String(user._id));

      const spoofed = await request(app)
        .post('/api/user/listings')
        .set('Cookie', [`rgo_at=${token}`])
        .send({ ...validListingBody(), owner: 'deadbeefdeadbeefdeadbeef', moderationStatus: 'APPROVED' });
      expect(spoofed.status).toBe(400);
    });

    it('lists only the caller\'s own listings', async () => {
      const { user, token } = await makeUser();
      const { user: other } = await makeUser();
      await makeCar(String(user._id));
      await makeCar(String(other._id));

      const res = await request(app).get('/api/user/listings').set('Cookie', [`rgo_at=${token}`]);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].owner).toBe(String(user._id));
    });

    it('updates a DRAFT listing owned by the caller; a non-owner gets 404', async () => {
      const { user, token } = await makeUser();
      const { token: otherToken } = await makeUser();
      const car = await makeCar(String(user._id));

      const forbidden = await request(app)
        .patch(`/api/user/listings/${car._id}`)
        .set('Cookie', [`rgo_at=${otherToken}`])
        .send({ description: 'nice car' });
      expect(forbidden.status).toBe(404);

      const updated = await request(app)
        .patch(`/api/user/listings/${car._id}`)
        .set('Cookie', [`rgo_at=${token}`])
        .send({ rentalPricePerDay: 1500 });
      expect(updated.status).toBe(200);
      expect(updated.body.data.rentalPricePerDay).toBe(1500);

      const log = await AuditLog.findOne({ entityType: 'CAR', entityId: car._id, action: 'CAR_EDITED' });
      expect(log).not.toBeNull();
    });

    it('blocks editing an APPROVED listing (guardEditableModerationState)', async () => {
      const { user, token } = await makeUser();
      const car = await makeCar(String(user._id), { moderationStatus: 'APPROVED' });

      const res = await request(app)
        .patch(`/api/user/listings/${car._id}`)
        .set('Cookie', [`rgo_at=${token}`])
        .send({ description: 'nope' });
      expect(res.status).toBe(409);
      expect(res.body.error.details.guard).toBe('guardEditableModerationState');
    });

    it('deletes a never-moderated, never-booked DRAFT listing; refuses one with any booking history', async () => {
      const { user, token } = await makeUser();
      const draft = await makeCar(String(user._id));

      const deleted = await request(app).delete(`/api/user/listings/${draft._id}`).set('Cookie', [`rgo_at=${token}`]);
      expect(deleted.status).toBe(200);
      expect(deleted.body.data.deleted).toBe(true);
      expect(await Car.findById(draft._id)).toBeNull();

      const car2 = await makeCar(String(user._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const { user: renter } = await makeUser();
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 5);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 2);
      await Booking.create({
        car: car2._id,
        renter: renter._id,
        owner: user._id,
        startDate,
        endDate,
        days: 2,
        ratePerDaySnapshot: 1000,
        depositSnapshot: 0,
        quotedTotalAmount: 2000,
        totalAmount: 2000,
        status: 'REQUESTED',
      });

      const refused = await request(app).delete(`/api/user/listings/${car2._id}`).set('Cookie', [`rgo_at=${token}`]);
      expect(refused.status).toBe(409);
      expect(refused.body.error.details.guard).toBe('guardNeverModerated');
    });
  });

  describe('Bookings', () => {
    it('requests a booking on a publicly bookable car, snapshotting the rate; rejects self-rental', async () => {
      const { user: owner } = await makeUser();
      const { user: renter, token: renterToken } = await makeUser();
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED', rentalPricePerDay: 1200 });

      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 5);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 3);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/api/user/bookings')
        .set('Cookie', [`rgo_at=${renterToken}`])
        .send({ carId: String(car._id), startDate: fmt(startDate), endDate: fmt(endDate) });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('REQUESTED');
      expect(res.body.data.ratePerDaySnapshot).toBe(1200);
      expect(res.body.data.totalAmount).toBe(3600);
      expect(res.body.data.renter).toBe(String(renter._id));

      const log = await AuditLog.findOne({ entityType: 'BOOKING', entityId: res.body.data._id, action: 'BOOKING_REQUESTED' });
      expect(log).not.toBeNull();

      const { token: ownerToken } = { token: signAccessToken({ sub: String(owner._id), role: 'USER', isActive: true }) };
      const selfRental = await request(app)
        .post('/api/user/bookings')
        .set('Cookie', [`rgo_at=${ownerToken}`])
        .send({ carId: String(car._id), startDate: fmt(startDate), endDate: fmt(endDate) });
      expect(selfRental.status).toBe(409);
      expect(selfRental.body.error.details.guard).toBe('guardNotOwnRental');
    });

    it('returns 404 for a car that is not publicly bookable', async () => {
      const { user: owner } = await makeUser();
      const { token: renterToken } = await makeUser();
      const car = await makeCar(String(owner._id)); // DRAFT

      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 5);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 3);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/api/user/bookings')
        .set('Cookie', [`rgo_at=${renterToken}`])
        .send({ carId: String(car._id), startDate: fmt(startDate), endDate: fmt(endDate) });
      expect(res.status).toBe(404);
    });

    it('lists only the caller\'s own bookings, scoped by role', async () => {
      const { user: owner, token: ownerToken } = await makeUser();
      const { user: renter, token: renterToken } = await makeUser();
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 5);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 2);
      await Booking.create({
        car: car._id,
        renter: renter._id,
        owner: owner._id,
        startDate,
        endDate,
        days: 2,
        ratePerDaySnapshot: 1000,
        depositSnapshot: 0,
        quotedTotalAmount: 2000,
        totalAmount: 2000,
        status: 'REQUESTED',
      });

      const asRenter = await request(app).get('/api/user/bookings').set('Cookie', [`rgo_at=${renterToken}`]);
      expect(asRenter.status).toBe(200);
      expect(asRenter.body.data.length).toBe(1);

      const asOwnerAsRenter = await request(app).get('/api/user/bookings').set('Cookie', [`rgo_at=${ownerToken}`]);
      expect(asOwnerAsRenter.body.data.length).toBe(0);

      const asOwner = await request(app).get('/api/user/bookings').query({ role: 'OWNER' }).set('Cookie', [`rgo_at=${ownerToken}`]);
      expect(asOwner.status).toBe(200);
      expect(asOwner.body.data.length).toBe(1);
    });

    it('cancels own REQUESTED booking; the car owner may not cancel it here; a confirmed booking cannot be cancelled here', async () => {
      const { user: owner, token: ownerToken } = await makeUser();
      const { user: renter, token: renterToken } = await makeUser();
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 5);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 2);

      const b1 = await Booking.create({
        car: car._id,
        renter: renter._id,
        owner: owner._id,
        startDate,
        endDate,
        days: 2,
        ratePerDaySnapshot: 1000,
        depositSnapshot: 0,
        quotedTotalAmount: 2000,
        totalAmount: 2000,
        status: 'REQUESTED',
      });

      const ownerAttempt = await request(app)
        .post(`/api/user/bookings/${b1._id}/cancel`)
        .set('Cookie', [`rgo_at=${ownerToken}`])
        .send({});
      expect(ownerAttempt.status).toBe(403);
      expect(ownerAttempt.body.error.code).toBe('FORBIDDEN_TRANSITION');

      const cancelled = await request(app)
        .post(`/api/user/bookings/${b1._id}/cancel`)
        .set('Cookie', [`rgo_at=${renterToken}`])
        .send({ reason: 'changed my mind' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      const b2 = await Booking.create({
        car: car._id,
        renter: renter._id,
        owner: owner._id,
        startDate,
        endDate,
        days: 2,
        ratePerDaySnapshot: 1000,
        depositSnapshot: 0,
        quotedTotalAmount: 2000,
        totalAmount: 2000,
        status: 'CONFIRMED',
      });
      const confirmedAttempt = await request(app)
        .post(`/api/user/bookings/${b2._id}/cancel`)
        .set('Cookie', [`rgo_at=${renterToken}`])
        .send({});
      expect(confirmedAttempt.status).toBe(409);
      expect(confirmedAttempt.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('Profile', () => {
    it('reads and updates the caller\'s own profile; email/role/status are rejected', async () => {
      const { user, token } = await makeUser();

      const read = await request(app).get('/api/user/profile').set('Cookie', [`rgo_at=${token}`]);
      expect(read.status).toBe(200);
      expect(read.body.data.email).toBe(user.email);

      const updated = await request(app)
        .patch('/api/user/profile')
        .set('Cookie', [`rgo_at=${token}`])
        .send({ name: 'New Name' });
      expect(updated.status).toBe(200);
      expect(updated.body.data.name).toBe('New Name');

      const rejected = await request(app)
        .patch('/api/user/profile')
        .set('Cookie', [`rgo_at=${token}`])
        .send({ email: 'new@example.com' });
      expect(rejected.status).toBe(400);

      const log = await AuditLog.findOne({ entityType: 'USER', entityId: user._id, action: 'USER_PROFILE_UPDATED' });
      expect(log).not.toBeNull();
    });

    it('rejects a phone already in use by another account', async () => {
      const { user: other } = await makeUser();
      const { token } = await makeUser();

      const res = await request(app)
        .patch('/api/user/profile')
        .set('Cookie', [`rgo_at=${token}`])
        .send({ phone: other.phone });
      expect(res.status).toBe(409);
      expect(res.body.error.details.field).toBe('phone');
    });
  });
});
