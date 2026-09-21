import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Booking } from '../../../src/models/Booking.model.js';
import { BOOKING_STATUSES } from '@rango/shared';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    car: new mongoose.Types.ObjectId(),
    renter: new mongoose.Types.ObjectId(),
    owner: new mongoose.Types.ObjectId(),
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: new Date('2026-10-03T00:00:00Z'),
    days: 2,
    ratePerDaySnapshot: 1200,
    depositSnapshot: 0,
    quotedTotalAmount: 2400,
    totalAmount: 2400,
    termsAcceptedAt: new Date(),
    ...overrides,
  };
}

describe('Booking model (D4/D6/D7)', () => {
  it('defaults amountReceived and the deposit ledger fields to 0', async () => {
    const booking = await Booking.create(fixture());
    expect(booking.amountReceived).toBe(0);
    expect(booking.depositReceived).toBe(0);
    expect(booking.depositReturned).toBe(0);
    expect(booking.depositRetained).toBe(0);
    expect(booking.lateFeeAmount).toBe(0);
    expect(booking.noShowCleared).toBe(false);
  });

  it('defaults status to REQUESTED', async () => {
    const booking = await Booking.create(fixture());
    expect(booking.status).toBe('REQUESTED');
  });

  it('accepts all nine booking states', async () => {
    for (const status of BOOKING_STATUSES) {
      await expect(Booking.create(fixture({ status }))).resolves.toBeDefined();
    }
  });

  it('rejects an unknown status', async () => {
    await expect(Booking.create(fixture({ status: 'BOGUS' }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await Booking.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ car: 1, startDate: 1, endDate: 1 }));
    expect(keys).toContain(JSON.stringify({ renter: 1, status: 1 }));
    expect(keys).toContain(JSON.stringify({ owner: 1, status: 1 }));
    expect(keys).toContain(JSON.stringify({ status: 1 }));
    expect(keys).toContain(JSON.stringify({ status: 1, startDate: 1 }));
  });
});
