import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { BOOKING_DAY_LOCK_SOURCES } from '../enums/bookingDayLockSource.enum.js';

export const bookingDayLockEntitySchema = z.object({
  _id: objectIdSchema,
  car: objectIdSchema,
  day: z.coerce.date(),
  source: z.enum(BOOKING_DAY_LOCK_SOURCES),
  booking: objectIdSchema.optional(), // required iff source in { BOOKING, BUFFER }
  blockId: z.string().optional(), // required iff source = ADMIN_BLOCK
  reason: z.string().optional(), // required iff source = ADMIN_BLOCK
  convertedFromBufferOf: objectIdSchema.optional(),
  createdBy: objectIdSchema,
  createdAt: z.coerce.date(),
});

export type BookingDayLockEntity = z.infer<typeof bookingDayLockEntitySchema>;
