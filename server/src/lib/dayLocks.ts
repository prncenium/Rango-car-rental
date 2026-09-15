import type { ClientSession, Types } from 'mongoose';
import { BookingDayLock } from '../models/BookingDayLock.model.js';
import { ConflictError } from './errors.js';

// D5 — half-open [startDate, endDate), all days normalised to UTC midnight.
export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function expandRange(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  let cursor = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  while (cursor.getTime() < end.getTime()) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Confirming a booking inserts one BOOKING lock per day inside the caller's
// transaction. A duplicate-key error on any insert aborts the whole thing —
// the database is the sole arbiter of overlap (design D5/§6), never a
// read-then-write check.
export async function insertBookingLocks(
  session: ClientSession,
  params: { car: Types.ObjectId; booking: Types.ObjectId; startDate: Date; endDate: Date; createdBy: Types.ObjectId },
): Promise<void> {
  const days = expandRange(params.startDate, params.endDate);

  // A pre-check (still inside the healthy transaction) so the common case —
  // an admin confirming into an already-visibly-occupied range — gets a
  // full, precise conflictingDays list. This is advisory, not the arbiter:
  // the insertMany below, guarded by the unique index, is what actually
  // resolves a genuine race between two concurrent confirms (design D5/§6).
  const existing = await BookingDayLock.find({ car: params.car, day: { $in: days } })
    .session(session)
    .lean();
  if (existing.length > 0) {
    throw new ConflictError('These dates are no longer available.', {
      reason: 'DATES_UNAVAILABLE',
      conflictingDays: existing.map((d) => fmt(d.day)),
    });
  }

  const docs = days.map((day) => ({
    car: params.car,
    day,
    source: 'BOOKING' as const,
    booking: params.booking,
    createdBy: params.createdBy,
  }));

  try {
    await BookingDayLock.insertMany(docs, { session, ordered: true });
  } catch (err: unknown) {
    const isDuplicateKey =
      typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000;
    if (!isDuplicateKey) {
      throw err;
    }
    // Two transactions raced past the pre-check simultaneously. The unique
    // index is the actual arbiter here (design D5) — we cannot safely read
    // which days the other side took without risking the same session-after-
    // error hang the pre-check above exists to avoid, so this path reports
    // the conflict without enumerating days.
    throw new ConflictError('These dates are no longer available.', {
      reason: 'DATES_UNAVAILABLE',
    });
  }
}

export async function releaseBookingLocks(session: ClientSession, bookingId: Types.ObjectId): Promise<void> {
  await BookingDayLock.deleteMany({ booking: bookingId }).session(session);
}
