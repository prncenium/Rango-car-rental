import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { User } from '../../src/models/User.model.js';
import { Car } from '../../src/models/Car.model.js';
import { Booking } from '../../src/models/Booking.model.js';
import { BookingDayLock } from '../../src/models/BookingDayLock.model.js';
import { AuditLog } from '../../src/models/AuditLog.model.js';

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Test-only token minting, mirroring the exact shape src/lib/jwt.ts verifies.
// Issuing tokens for real is AUTH-02's job, not built in this pass.
function signAccessToken(payload: { sub: string; role: string; isActive: boolean }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    jti: 'test-jti',
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlEncode(
    createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

async function makeUser(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', overrides: Partial<Record<string, unknown>> = {}) {
  const user = await User.create({
    name: 'Test User',
    email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1${Math.floor(Math.random() * 1e9)}`,
    passwordHash: 'not-a-real-hash',
    role,
    isActive: true,
    drivingLicence: { number: 'DL1234567', enteredAt: new Date() },
    ...overrides,
  });
  return { user, token: signAccessToken({ sub: String(user._id), role, isActive: true }) };
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
    moderationStatus: 'PENDING_APPROVAL',
    listingState: 'UNLISTED',
    ...overrides,
  });
}

async function makeBooking(
  carId: string,
  renterId: string,
  ownerId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() + 5);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 3);
  return Booking.create({
    car: carId,
    renter: renterId,
    owner: ownerId,
    startDate,
    endDate,
    days: 3,
    ratePerDaySnapshot: 1000,
    depositSnapshot: 0,
    quotedTotalAmount: 3000,
    totalAmount: 3000,
    status: 'REQUESTED',
    ...overrides,
  });
}

describe('Admin endpoints (CAR/BOOK/PAY/ADM)', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/admin/dashboard/counts');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a non-admin actor', async () => {
    const { token } = await makeUser('USER');
    const res = await request(app).get('/api/admin/dashboard/counts').set('Cookie', [`rgo_at=${token}`]);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  describe('Car moderation', () => {
    it('approve requires PENDING_APPROVAL and sets APPROVED with an audit row', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const car = await makeCar(String(owner._id));

      const res = await request(app)
        .post(`/api/admin/listings/${car._id}/approve`)
        .set('Cookie', [`rgo_at=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.moderationStatus).toBe('APPROVED');

      const log = await AuditLog.findOne({ entityType: 'CAR', entityId: car._id, action: 'CAR_APPROVED' });
      expect(log).not.toBeNull();
      expect(log!.previousState).toBe('PENDING_APPROVAL');
      expect(log!.newState).toBe('APPROVED');
    });

    it('reject requires a reason', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const car = await makeCar(String(owner._id));

      const missing = await request(app)
        .post(`/api/admin/listings/${car._id}/reject`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({});
      expect(missing.status).toBe(400);

      const res = await request(app)
        .post(`/api/admin/listings/${car._id}/reject`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'Photos too blurry' });
      expect(res.status).toBe(200);
      expect(res.body.data.moderationStatus).toBe('REJECTED');
    });

    it('publish is blocked until APPROVED (INV-1), then delist requires no active locks', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const car = await makeCar(String(owner._id));

      const tooEarly = await request(app)
        .post(`/api/admin/listings/${car._id}/publish`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(tooEarly.status).toBe(409);
      expect(tooEarly.body.error.code).toBe('GUARD_FAILED');
      expect(tooEarly.body.error.details.guard).toBe('guardCarApproved');

      await request(app).post(`/api/admin/listings/${car._id}/approve`).set('Cookie', [`rgo_at=${adminToken}`]);

      const published = await request(app)
        .post(`/api/admin/listings/${car._id}/publish`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(published.status).toBe(200);
      expect(published.body.data.listingState).toBe('LISTED');

      const delisted = await request(app)
        .post(`/api/admin/listings/${car._id}/delist`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'owner request' });
      expect(delisted.status).toBe(200);
      expect(delisted.body.data.listingState).toBe('DELISTED');

      const relisted = await request(app)
        .post(`/api/admin/listings/${car._id}/relist`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(relisted.status).toBe(200);
      expect(relisted.body.data.listingState).toBe('LISTED');
    });
  });

  describe('Booking lifecycle', () => {
    it('confirm acquires day-locks; a second overlapping confirm 409s', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const b1 = await makeBooking(String(car._id), String(renter._id), String(owner._id));
      const b2 = await makeBooking(String(car._id), String(renter._id), String(owner._id));

      const confirmed = await request(app)
        .post(`/api/admin/bookings/${b1._id}/confirm`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.status).toBe('CONFIRMED');

      const lockCount = await BookingDayLock.countDocuments({ booking: b1._id });
      expect(lockCount).toBe(3);

      const conflict = await request(app)
        .post(`/api/admin/bookings/${b2._id}/confirm`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.details.reason).toBe('DATES_UNAVAILABLE');

      // The loser stays REQUESTED (spec 04 §1.4 — no auto-reject cascade).
      const reloaded = await Booking.findById(b2._id);
      expect(reloaded!.status).toBe('REQUESTED');
    });

    it('activation requires settled payment, or an audited override', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));

      await request(app).post(`/api/admin/bookings/${booking._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);

      const unpaid = await request(app)
        .post(`/api/admin/bookings/${booking._id}/mark-active`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({});
      expect(unpaid.status).toBe(409);
      expect(unpaid.body.error.details.guard).toBe('guardPaymentCovered');

      const overridden = await request(app)
        .post(`/api/admin/bookings/${booking._id}/mark-active`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ overrideReason: 'Renter is a regular, trusted to settle after handover' });
      expect(overridden.status).toBe(200);
      expect(overridden.body.data.status).toBe('ACTIVE');

      const log = await AuditLog.findOne({ entityType: 'BOOKING', entityId: booking._id, action: 'BOOKING_ACTIVATED_UNPAID' });
      expect(log).not.toBeNull();
    });

    it('confirm-offline-payment settles cash and unblocks activation without an override', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));

      await request(app).post(`/api/admin/bookings/${booking._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);

      const paid = await request(app)
        .post(`/api/admin/bookings/${booking._id}/confirm-offline-payment`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ amount: 3000, paymentMethod: 'CASH', purpose: 'RENTAL' });
      expect(paid.status).toBe(201);

      const reloaded = await Booking.findById(booking._id);
      expect(reloaded!.amountReceived).toBe(3000);

      const active = await request(app)
        .post(`/api/admin/bookings/${booking._id}/mark-active`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({});
      expect(active.status).toBe(200);
      expect(active.body.data.status).toBe('ACTIVE');

      const returned = await request(app)
        .post(`/api/admin/bookings/${booking._id}/mark-returned`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ odometerIn: 10500 });
      expect(returned.status).toBe(200);
      expect(returned.body.data.status).toBe('COMPLETED');

      const remainingLocks = await BookingDayLock.countDocuments({ booking: booking._id });
      expect(remainingLocks).toBe(0);
    });

    it('reject and cancel both require a reason', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));

      const rejected = await request(app)
        .post(`/api/admin/bookings/${booking._id}/reject`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'Owner unavailable' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('REJECTED');

      const booking2 = await makeBooking(String(car._id), String(renter._id), String(owner._id));
      await request(app).post(`/api/admin/bookings/${booking2._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);
      const cancelled = await request(app)
        .post(`/api/admin/bookings/${booking2._id}/cancel`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'Car sold' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
      expect(await BookingDayLock.countDocuments({ booking: booking2._id })).toBe(0);
    });

    it('no-show requires the start date to have passed', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });

      const pastStart = new Date();
      pastStart.setUTCDate(pastStart.getUTCDate() - 2);
      const pastEnd = new Date();
      pastEnd.setUTCDate(pastEnd.getUTCDate() + 1);
      const booking = await Booking.create({
        car: car._id,
        renter: renter._id,
        owner: owner._id,
        startDate: pastStart,
        endDate: pastEnd,
        days: 3,
        ratePerDaySnapshot: 1000,
        depositSnapshot: 0,
        quotedTotalAmount: 3000,
        totalAmount: 3000,
        status: 'CONFIRMED',
      });

      const noShow = await request(app)
        .post(`/api/admin/bookings/${booking._id}/no-show`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'never arrived' });
      expect(noShow.status).toBe(200);
      expect(noShow.body.data.status).toBe('NO_SHOW');
      expect(noShow.body.data.noShowCleared).toBe(false);
    });
  });

  describe('User suspension', () => {
    it('deactivate requires a reason and blocks removing the last admin', async () => {
      const { user: admin, token: adminToken } = await makeUser('ADMIN');
      const { user: plainUser } = await makeUser('USER');

      const missingReason = await request(app)
        .post(`/api/admin/users/${plainUser._id}/deactivate`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({});
      expect(missingReason.status).toBe(400);

      const deactivated = await request(app)
        .post(`/api/admin/users/${plainUser._id}/deactivate`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'Abuse reported' });
      expect(deactivated.status).toBe(200);
      expect(deactivated.body.data.isActive).toBe(false);

      const reactivated = await request(app)
        .post(`/api/admin/users/${plainUser._id}/reactivate`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.data.isActive).toBe(true);

      // Only one active admin exists — deactivating self must be refused.
      const lastAdmin = await request(app)
        .post(`/api/admin/users/${admin._id}/deactivate`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'testing' });
      expect(lastAdmin.status).toBe(409);
      expect(lastAdmin.body.error.details.guard).toBe('guardNotLastAdmin');
    });
  });

  describe('Admin listing read endpoints (ADM-03)', () => {
    it('lists cars across every moderation/listing combination and returns a full detail shape', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const draft = await makeCar(String(owner._id), { moderationStatus: 'DRAFT', listingState: 'UNLISTED' });
      await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });

      const list = await request(app)
        .get('/api/admin/listings')
        .query({ moderationStatus: 'DRAFT' })
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(list.status).toBe(200);
      expect(list.body.data.some((c: { _id: string }) => c._id === String(draft._id))).toBe(true);

      const detail = await request(app)
        .get(`/api/admin/listings/${draft._id}`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(detail.status).toBe(200);
      expect(detail.body.data.owner.email).toBe(owner.email);
      expect(detail.body.data).toHaveProperty('lockedDayCount');
      expect(detail.body.data.activeBookingId).toBeNull();

      const missing = await request(app)
        .get(`/api/admin/listings/${owner._id}`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(missing.status).toBe(404);
    });
  });

  describe('Admin booking read endpoints (ADM-04)', () => {
    it('lists any booking regardless of party and filters unpaidOnly', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));
      await request(app).post(`/api/admin/bookings/${booking._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);

      const unpaid = await request(app)
        .get('/api/admin/bookings')
        .query({ unpaidOnly: 'true' })
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(unpaid.status).toBe(200);
      expect(unpaid.body.data.some((b: { _id: string }) => b._id === String(booking._id))).toBe(true);

      const detail = await request(app)
        .get(`/api/admin/bookings/${booking._id}`)
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(detail.status).toBe(200);
      expect(detail.body.data.renter.email).toBe(renter.email);
      expect(detail.body.data.owner.email).toBe(owner.email);
      expect(detail.body.data.payments).toEqual([]);
      expect(detail.body.data.dayLocks.count).toBe(3);
    });

    it('admin cancels a CONFIRMED booking directly (phone-call resolution) with no user-facing request-cancellation route', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter, token: renterToken } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));
      await request(app).post(`/api/admin/bookings/${booking._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);

      // The renter's own cancel endpoint only reaches REQUESTED->CANCELLED;
      // against a CONFIRMED booking it must not silently succeed.
      const renterAttempt = await request(app)
        .post(`/api/user/bookings/${booking._id}/cancel`)
        .set('Cookie', [`rgo_at=${renterToken}`])
        .send({ reason: 'called to cancel' });
      expect(renterAttempt.status).toBe(409);
      expect(renterAttempt.body.error.code).toBe('INVALID_TRANSITION');

      const cancelled = await request(app)
        .post(`/api/admin/bookings/${booking._id}/cancel`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ reason: 'Renter called to cancel over the phone' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
      expect(await BookingDayLock.countDocuments({ booking: booking._id })).toBe(0);
    });
  });

  describe('Admin payment list endpoint (ADM-05)', () => {
    it('lists payments filtered by booking, direction, status, purpose, admin-only', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const { user: renter, token: renterToken } = await makeUser('USER');
      const car = await makeCar(String(owner._id), { moderationStatus: 'APPROVED', listingState: 'LISTED' });
      const booking = await makeBooking(String(car._id), String(renter._id), String(owner._id));
      await request(app).post(`/api/admin/bookings/${booking._id}/confirm`).set('Cookie', [`rgo_at=${adminToken}`]);
      await request(app)
        .post(`/api/admin/bookings/${booking._id}/confirm-offline-payment`)
        .set('Cookie', [`rgo_at=${adminToken}`])
        .send({ amount: 3000, paymentMethod: 'CASH', purpose: 'RENTAL' });

      const forbidden = await request(app)
        .get('/api/admin/payments')
        .set('Cookie', [`rgo_at=${renterToken}`]);
      expect(forbidden.status).toBe(403);

      const list = await request(app)
        .get('/api/admin/payments')
        .query({ booking: String(booking._id), direction: 'IN', status: 'SETTLED', purpose: 'RENTAL' })
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBe(1);
      expect(list.body.data[0].amount).toBe(3000);
    });
  });

  describe('Audit query and dashboard counts', () => {
    it('filters the audit log and reports dashboard counts', async () => {
      const { token: adminToken } = await makeUser('ADMIN');
      const { user: owner } = await makeUser('USER');
      const car = await makeCar(String(owner._id));
      await request(app).post(`/api/admin/listings/${car._id}/approve`).set('Cookie', [`rgo_at=${adminToken}`]);

      const audit = await request(app)
        .get('/api/admin/audit')
        .query({ entityType: 'CAR', action: 'CAR_APPROVED' })
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(audit.status).toBe(200);
      expect(audit.body.data.length).toBeGreaterThanOrEqual(1);
      expect(audit.body.meta.total).toBeGreaterThanOrEqual(1);

      const badFilter = await request(app)
        .get('/api/admin/audit')
        .query({ entityType: 'NOT_REAL' })
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(badFilter.status).toBe(400);

      const dashboard = await request(app)
        .get('/api/admin/dashboard/counts')
        .set('Cookie', [`rgo_at=${adminToken}`]);
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.data.queues).toBeDefined();
    });
  });
});
