import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { Car } from '../models/Car.model.js';
import { BookingDayLock } from '../models/BookingDayLock.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { expandRange } from '../lib/dayLocks.js';

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
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
