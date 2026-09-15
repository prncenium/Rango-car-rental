import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Payment } from '../../../src/models/Payment.model.js';

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    booking: new mongoose.Types.ObjectId(),
    amount: 1000,
    paymentMethod: 'CASH',
    direction: 'IN',
    purpose: 'RENTAL',
    recordedBy: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('Payment model (D7)', () => {
  it('rejects a payment with no booking', async () => {
    const { booking: _booking, ...rest } = fixture();
    await expect(Payment.create(rest)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('does not accept REFUNDED as a status', async () => {
    await expect(Payment.create(fixture({ status: 'REFUNDED' }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('represents a refund as a new OUT payment pointing at the original via refundOf', async () => {
    const original = await Payment.create(fixture({ status: 'SETTLED', settledAt: new Date() }));
    const refund = await Payment.create(
      fixture({ direction: 'OUT', refundOf: original._id, status: 'SETTLED', settledAt: new Date() }),
    );
    expect(refund.refundOf?.toString()).toBe(original._id.toString());
    const untouchedOriginal = await Payment.findById(original._id);
    expect(untouchedOriginal!.amount).toBe(1000);
  });

  it('defaults status to PENDING', async () => {
    const payment = await Payment.create(fixture());
    expect(payment.status).toBe('PENDING');
  });

  it('has the indexes required by design §4.2', async () => {
    const indexes = await Payment.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ booking: 1 }));
    expect(keys).toContain(JSON.stringify({ status: 1 }));
    expect(keys).toContain(JSON.stringify({ booking: 1, purpose: 1, direction: 1 }));
  });
});
