import { Schema, model, type Types } from 'mongoose';
import { BOOKING_DAY_LOCK_SOURCES, type BookingDayLockSource } from '@rango/shared';

export interface BookingDayLockDoc {
  car: Types.ObjectId;
  day: Date; // UTC midnight
  source: BookingDayLockSource;
  booking?: Types.ObjectId; // required iff source in { BOOKING, BUFFER }
  blockId?: string; // required iff source = ADMIN_BLOCK
  reason?: string; // required iff source = ADMIN_BLOCK
  convertedFromBufferOf?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export const BookingDayLockSchema = new Schema<BookingDayLockDoc>(
  {
    car: { type: Schema.Types.ObjectId, ref: 'Car', required: true },
    day: { type: Date, required: true },
    source: { type: String, enum: BOOKING_DAY_LOCK_SOURCES, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    blockId: { type: String },
    reason: { type: String },
    convertedFromBufferOf: { type: Schema.Types.ObjectId, ref: 'Booking' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// D5 — the single load-bearing index: one row per occupied day, arbitrated by the database.
BookingDayLockSchema.index({ car: 1, day: 1 }, { unique: true });
BookingDayLockSchema.index({ booking: 1 });
BookingDayLockSchema.index({ blockId: 1 });
BookingDayLockSchema.index({ car: 1, source: 1, day: 1 });

export const BookingDayLock = model<BookingDayLockDoc>('BookingDayLock', BookingDayLockSchema);
