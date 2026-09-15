import type { FilterQuery } from 'mongoose';
import { Car, type CarDoc } from '../models/Car.model.js';
import { BookingDayLock } from '../models/BookingDayLock.model.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { expandRange, toUtcMidnight } from '../lib/dayLocks.js';

// spec 02 §9 (E-06/E-07/E-08) — every query in this namespace is filtered to
// `moderationStatus = APPROVED AND listingState = LISTED` at the service
// layer, not the route layer, so a new caller cannot forget it (design INV-1).
const PUBLIC_VISIBILITY_FILTER = { moderationStatus: 'APPROVED', listingState: 'LISTED' } as const;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// PublicCarSummary (spec 02 §7.2) — deliberately excludes owner (any form),
// registrationNumber, moderationStatus, listingState, rejectionReason,
// approvedBy, and any booking history.
function toPublicCarSummary(car: CarDoc & { _id: unknown }) {
  return {
    id: String(car._id),
    make: car.make,
    model: car.model,
    year: car.year,
    transmission: car.transmission,
    fuelType: car.fuelType,
    seats: car.seats,
    mileageKm: car.mileageKm,
    color: car.color,
    rentalPricePerDay: car.rentalPricePerDay,
    location: { city: car.location.city, state: car.location.state },
    primaryImageUrl: car.images[0],
    imageCount: car.images.length,
    publishedAt: car.publishedAt,
  };
}

function toPublicCarDetail(car: CarDoc & { _id: unknown }) {
  return {
    ...toPublicCarSummary(car),
    description: car.description,
    images: car.images,
    location: { city: car.location.city, state: car.location.state, geo: car.location.geo },
  };
}

export interface PublicCarQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  q?: string | undefined;
  make?: string[] | undefined;
  transmission?: string[] | undefined;
  fuelType?: string[] | undefined;
  seatsMin?: number | undefined;
  seatsMax?: number | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
  availableFrom?: string | undefined;
  availableTo?: string | undefined;
}

const SORT_WHITELIST: Record<string, Record<string, 1 | -1>> = {
  'rentalPricePerDay:asc': { rentalPricePerDay: 1 },
  'rentalPricePerDay:desc': { rentalPricePerDay: -1 },
  'publishedAt:desc': { publishedAt: -1 },
  'year:desc': { year: -1 },
  'seats:asc': { seats: 1 },
};

// spec 02 §2.2 "$" is a Mongo-special char that must not reach a regex build
// from user input verbatim (spec 02 §4.3: "escaped before use").
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// spec 02 E-06 — public search, filtered to APPROVED+LISTED unconditionally.
// There is deliberately no moderationStatus/listingState/ownerId parameter in
// PublicCarQuery at all, so requesting one is a 400 at the route's Zod layer,
// never a filter this service has to remember to reject.
export async function listPublicCars(query: PublicCarQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;
  const sortKey = query.sort && SORT_WHITELIST[query.sort] ? query.sort : 'publishedAt:desc';

  if ((query.availableFrom === undefined) !== (query.availableTo === undefined)) {
    throw new ValidationError('availableFrom and availableTo must both be provided or both omitted.', {
      source: 'query',
      fieldErrors: { availableFrom: ['both availableFrom and availableTo are required together'] },
    });
  }

  const filter: FilterQuery<CarDoc> = { ...PUBLIC_VISIBILITY_FILTER };

  if (query.city) filter['location.city'] = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.state) filter['location.state'] = new RegExp(`^${escapeRegex(query.state)}$`, 'i');
  if (query.make?.length) filter.make = { $in: query.make.map((m) => new RegExp(`^${escapeRegex(m)}$`, 'i')) };
  if (query.transmission?.length) filter.transmission = { $in: query.transmission as CarDoc['transmission'][] };
  if (query.fuelType?.length) filter.fuelType = { $in: query.fuelType as CarDoc['fuelType'][] };

  if (query.seatsMin !== undefined || query.seatsMax !== undefined) {
    filter.seats = {};
    if (query.seatsMin !== undefined) filter.seats.$gte = query.seatsMin;
    if (query.seatsMax !== undefined) filter.seats.$lte = query.seatsMax;
  }
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    filter.rentalPricePerDay = {};
    if (query.priceMin !== undefined) filter.rentalPricePerDay.$gte = query.priceMin;
    if (query.priceMax !== undefined) filter.rentalPricePerDay.$lte = query.priceMax;
  }
  if (query.yearMin !== undefined || query.yearMax !== undefined) {
    filter.year = {};
    if (query.yearMin !== undefined) filter.year.$gte = query.yearMin;
    if (query.yearMax !== undefined) filter.year.$lte = query.yearMax;
  }
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ make: re }, { model: re }, { description: re }];
  }

  // Two-stage query (spec 02 §9 E-06): filter cars, then exclude those with
  // any BookingDayLock overlapping [availableFrom, availableTo).
  let excludedCarIds: string[] | undefined;
  if (query.availableFrom && query.availableTo) {
    const from = new Date(query.availableFrom);
    const to = new Date(query.availableTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
      throw new ValidationError('Invalid availability window.', {
        source: 'query',
        fieldErrors: { availableTo: ['must be a valid date after availableFrom'] },
      });
    }
    const days = expandRange(from, to);
    const locked = await BookingDayLock.find({ day: { $in: days } }).distinct('car');
    excludedCarIds = locked.map((id) => String(id));
    if (excludedCarIds.length > 0) {
      filter._id = { $nin: excludedCarIds };
    }
  }

  const [rows, total] = await Promise.all([
    Car.find(filter)
      .sort({ ...SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Car.countDocuments(filter),
  ]);

  return {
    data: rows.map(toPublicCarSummary),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}

// spec 02 E-07 — 404 returned identically whether the car does not exist or
// exists but is not publicly visible (DRAFT/PENDING_APPROVAL/REJECTED/
// UNLISTED/DELISTED) — a public caller can never distinguish these cases.
export async function getPublicCarDetail(carId: string) {
  const car = await Car.findOne({ _id: carId, ...PUBLIC_VISIBILITY_FILTER }).lean();
  if (!car) {
    throw new NotFoundError('Car not found.');
  }
  return toPublicCarDetail(car);
}

const MAX_AVAILABILITY_WINDOW_DAYS = 180;

// spec 02 E-08 — sourced only from BookingDayLock (D5); availability is never
// read from a car field, because no such field exists (D2). The response
// carries days only, never bookingId/renter/source (spec 02 §9 "Leakage").
export async function getPublicAvailability(carId: string, from: string, to: string) {
  const car = await Car.findOne({ _id: carId, ...PUBLIC_VISIBILITY_FILTER }).lean();
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
  if (windowDays > MAX_AVAILABILITY_WINDOW_DAYS) {
    throw new ValidationError(`Availability window cannot exceed ${MAX_AVAILABILITY_WINDOW_DAYS} days.`, {
      source: 'query',
      fieldErrors: { to: [`window must not exceed ${MAX_AVAILABILITY_WINDOW_DAYS} days`] },
    });
  }

  const days = expandRange(fromDate, toDate);
  const locks = await BookingDayLock.find({ car: carId, day: { $in: days } })
    .sort({ day: 1 })
    .lean();

  const blockedDays = locks.map((l) => fmt(l.day));

  // Collapse contiguous days into half-open ranges for calendar rendering
  // (spec 02 §7.2: "a convenience collapse of blockedDays").
  const blockedRanges: { from: string; to: string }[] = [];
  for (const lock of locks) {
    const dayTime = lock.day.getTime();
    const last = blockedRanges.at(-1);
    if (last && new Date(`${last.to}T00:00:00.000Z`).getTime() === dayTime) {
      last.to = fmt(new Date(dayTime + 86_400_000));
    } else {
      blockedRanges.push({ from: fmt(lock.day), to: fmt(new Date(dayTime + 86_400_000)) });
    }
  }

  return { carId: String(car._id), from, to, blockedDays, blockedRanges };
}
