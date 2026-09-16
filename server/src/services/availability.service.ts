import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { Car } from '../models/Car.model.js';
import { BookingDayLock } from '../models/BookingDayLock.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { expandRange, toUtcMidnight } from '../lib/dayLocks.js';

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// spec 05.5 §4.1 E-36 — admin variant of the public availability read
// (publicCar.service.ts's getPublicAvailability): no visibility filter (an
// admin can inspect any car regardless of moderation/listing state), and
// each blockedRange additionally discloses source/bookingId/blockId/reason
// — the one place a blocked day's cause is shown (spec 04 §1.2). Window cap
// is wider than the public 180-day cap since an admin has an operational
// reason to see further out (spec 05.5 §4.1).
const MAX_ADMIN_AVAILABILITY_WINDOW_DAYS = 365;

export interface AdminAvailabilityRange {
  from: string;
  to: string;
  source: 'BOOKING' | 'BUFFER' | 'ADMIN_BLOCK';
  bookingId?: string;
  blockId?: string;
  reason?: string;
}

export async function getAdminAvailability(carId: string, from: string, to: string) {
  const car = await Car.findById(carId).lean();
  if (!car) {
    throw new NotFoundError('Car not found.');
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate.getTime() <= fromDate.getTime()) {
    throw new ValidationError('Invalid date range.', {
      source: 'query',
      fieldErrors: { to: ['must be a valid date after from'] },
    });
  }

  const windowDays = Math.round((toUtcMidnight(toDate).getTime() - toUtcMidnight(fromDate).getTime()) / 86_400_000);
  if (windowDays > MAX_ADMIN_AVAILABILITY_WINDOW_DAYS) {
    throw new ValidationError(`Availability window cannot exceed ${MAX_ADMIN_AVAILABILITY_WINDOW_DAYS} days.`, {
      source: 'query',
      fieldErrors: { to: [`window must not exceed ${MAX_ADMIN_AVAILABILITY_WINDOW_DAYS} days`] },
    });
  }

  const days = expandRange(fromDate, toDate);
  const locks = await BookingDayLock.find({ car: carId, day: { $in: days } })
    .sort({ day: 1 })
    .lean();

  const blockedDays = locks.map((l) => fmt(l.day));

  // Ranges only collapse across contiguous days sharing the same source and
  // origin (booking/block) — unlike the public collapse, which can merge any
  // contiguous run because it never discloses why a day is blocked.
  const blockedRanges: AdminAvailabilityRange[] = [];
  for (const lock of locks) {
    const dayTime = lock.day.getTime();
    const bookingId = lock.booking ? String(lock.booking) : undefined;
    const last = blockedRanges.at(-1);
    const sameGroup =
      last &&
      new Date(`${last.to}T00:00:00.000Z`).getTime() === dayTime &&
      last.source === lock.source &&
      last.bookingId === bookingId &&
      last.blockId === lock.blockId;

    if (sameGroup && last) {
      last.to = fmt(new Date(dayTime + 86_400_000));
    } else {
      blockedRanges.push({
        from: fmt(lock.day),
        to: fmt(new Date(dayTime + 86_400_000)),
        source: lock.source,
        ...(bookingId ? { bookingId } : {}),
        ...(lock.blockId ? { blockId: lock.blockId } : {}),
        ...(lock.reason ? { reason: lock.reason } : {}),
      });
    }
  }

  return { carId: String(car._id), from, to, blockedDays, blockedRanges };
}

// spec 04 §1.6 — an admin taking a car off the calendar without taking it off
// the market. RULE AV-4: a block never changes a booking's status.
//
// Simplification vs. the full spec: `force` skips days already locked by any
// source rather than distinguishing booking/buffer-vs-block conversion
// (RULE AV-5's reversible BUFFER<->ADMIN_BLOCK conversion is not implemented
// here — out of scope for this admin-endpoints pass).
export async function createAvailabilityBlock(
  carId: string,
  actor: ActorContext,
  params: { from: string; to: string; reason: string; force?: boolean | undefined },
): Promise<{ blockId: string; blockedDays: string[]; skippedDays: string[] }> {
  if (!params.reason || !params.reason.trim()) {
    throw new ValidationError('A reason is required to block dates.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required'] },
    });
  }
  const from = new Date(params.from);
  const to = new Date(params.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
    throw new ValidationError('Invalid date range.', {
      source: 'body',
      fieldErrors: { to: ['must be a valid date after from'] },
    });
  }

  const session = await mongoose.startSession();
  try {
    let result!: { blockId: string; blockedDays: string[]; skippedDays: string[] };
    await session.withTransaction(async () => {
      const car = await Car.findById(carId).session(session);
      if (!car) {
        throw new NotFoundError('Car not found.');
      }

      const days = expandRange(from, to);
      const existing = await BookingDayLock.find({ car: car._id, day: { $in: days } })
        .session(session)
        .lean();
      const existingDayTimes = new Set(existing.map((e) => e.day.getTime()));

      if (!params.force && existing.length > 0) {
        throw new ConflictError('Some of these dates are already locked.', {
          reason: 'DAYS_ALREADY_LOCKED',
          conflictingDays: existing.map((e) => fmt(e.day)),
          conflictingSources: [...new Set(existing.map((e) => e.source))],
        });
      }

      const blockable = days.filter((d) => !existingDayTimes.has(d.getTime()));
      const skipped = days.filter((d) => existingDayTimes.has(d.getTime()));
      const blockId = randomUUID();

      if (blockable.length > 0) {
        await BookingDayLock.insertMany(
          blockable.map((day) => ({
            car: car._id,
            day,
            source: 'ADMIN_BLOCK' as const,
            blockId,
            reason: params.reason,
            createdBy: actor.userId,
          })),
          { session, ordered: true },
        );
      }

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: skipped.length > 0 ? 'CAR_AVAILABILITY_BLOCKED_PARTIAL' : 'CAR_AVAILABILITY_BLOCKED',
            entityType: 'CAR',
            entityId: car._id,
            metadata: { from: params.from, to: params.to, dayCount: blockable.length, blockId, skippedDays: skipped.map(fmt) },
            reason: params.reason,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      result = { blockId, blockedDays: blockable.map(fmt), skippedDays: skipped.map(fmt) };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function deleteAvailabilityBlock(carId: string, blockId: string, actor: ActorContext): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const rows = await BookingDayLock.find({ car: carId, blockId }).session(session);
      if (rows.length === 0) {
        throw new NotFoundError('Block not found.');
      }
      if (rows.some((r) => r.source !== 'ADMIN_BLOCK')) {
        throw new ConflictError('This block cannot be removed here.', { guard: 'guardBlockIsAdminOwned' });
      }
      await BookingDayLock.deleteMany({ car: carId, blockId }).session(session);

      const firstRow = rows[0];
      if (!firstRow) {
        throw new NotFoundError('Block not found.');
      }
      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'CAR_AVAILABILITY_UNBLOCKED',
            entityType: 'CAR',
            entityId: firstRow.car,
            metadata: { blockId, dayCount: rows.length },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}
