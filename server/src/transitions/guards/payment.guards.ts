import type { HydratedDocument } from 'mongoose';
import type { PaymentDoc } from '../../models/Payment.model.js';
import { Booking } from '../../models/Booking.model.js';
import type { Guard } from './types.js';

type PaymentE = HydratedDocument<PaymentDoc>;

const AMOUNT_FIELD: Record<'RENTAL' | 'DEPOSIT', 'amountReceived' | 'depositReceived'> = {
  RENTAL: 'amountReceived',
  DEPOSIT: 'depositReceived',
};

// D6/D7 — settling an inbound payment must never push a booking's running
// total past what is actually owed (Booking.totalAmount for RENTAL,
// Booking.depositSnapshot for DEPOSIT); settling an outbound (refund)
// payment must never hand back more than is currently held. A cap of 0
// (no deposit was ever quoted) is treated as "no fixed expectation" rather
// than "nothing may ever be paid," so an admin can still record a deposit
// the car's listing never priced.
export const guardNotOverpaying: Guard<PaymentE> = {
  name: 'guardNotOverpaying',
  check: async (entity, _actor, session) => {
    const booking = await Booking.findById(entity.booking).session(session);
    if (!booking) {
      return { ok: false, details: { reason: 'BOOKING_NOT_FOUND' } };
    }
    const field = AMOUNT_FIELD[entity.purpose];
    const current = booking.get(field) as number;

    if (entity.direction === 'IN') {
      const cap = entity.purpose === 'RENTAL' ? booking.totalAmount : booking.depositSnapshot;
      if (cap > 0 && current + entity.amount > cap) {
        return { ok: false, details: { cap, current, attempted: entity.amount } };
      }
      return { ok: true };
    }

    if (entity.amount > current) {
      return { ok: false, details: { available: current, attempted: entity.amount } };
    }
    return { ok: true };
  },
};
