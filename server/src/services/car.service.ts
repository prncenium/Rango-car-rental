import mongoose, { type ClientSession, type FilterQuery, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Car, type CarDoc } from '../models/Car.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { transition } from '../transitions/transition.js';
import { carRegistry } from '../transitions/registry.js';
import { runGuards } from '../transitions/runGuards.js';
import {
  guardEditableModerationState,
  guardNeverModerated,
  guardNeverPublished,
  guardNoBookingsEver,
  guardNoLiveRentalOnPriceChange,
  guardRegistrationAvailable,
} from '../transitions/guards/car.guards.js';

type CarE = HydratedDocument<CarDoc>;

async function loadCarOrThrow(carId: string, session: ClientSession): Promise<CarE> {
  const car = await Car.findById(carId).session(session);
  if (!car) {
    throw new NotFoundError('Car not found.');
  }
  return car;
}

// Ownership failures are 404, not 403 (spec 02 §3.4 rule 2) — a car belonging
// to someone else is indistinguishable, to this caller, from one that does
// not exist.
async function loadOwnCarOrThrow(carId: string, actor: ActorContext, session: ClientSession): Promise<CarE> {
  const car = await loadCarOrThrow(carId, session);
  if (String(car.owner) !== String(actor.userId)) {
    throw new NotFoundError('Car not found.');
  }
  return car;
}

export interface ListingLocationInput {
  city: string;
  state: string;
  geo?: { type: 'Point'; coordinates: [number, number] } | undefined;
}

export interface CreateListingInput {
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  color?: string | undefined;
  transmission: CarDoc['transmission'];
  fuelType: CarDoc['fuelType'];
  seats: number;
  mileageKm: number;
  images: string[];
  description?: string | undefined;
  location: ListingLocationInput;
  rentalPricePerDay: number;
  rentalPricePerWeek?: number | undefined;
  depositAmount?: number | undefined;
}

// spec 02 E-09 — a private DRAFT is not a state transition anyone needs to
// audit (Audit: None) and does not go through transition() at all: there is
// no prior state, only the server-forced initial one. `owner` is taken from
// the session, never the body (D10) — it is not even a parameter here.
export async function createListing(actor: ActorContext, input: CreateListingInput): Promise<CarE> {
  return Car.create({
    ...input,
    owner: actor.userId,
    moderationStatus: 'DRAFT',
    listingState: 'UNLISTED',
  });
}

export interface UpdateListingInput {
  make?: string | undefined;
  model?: string | undefined;
  year?: number | undefined;
  registrationNumber?: string | undefined;
  color?: string | undefined;
  transmission?: CarDoc['transmission'] | undefined;
  fuelType?: CarDoc['fuelType'] | undefined;
  seats?: number | undefined;
  mileageKm?: number | undefined;
  images?: string[] | undefined;
  description?: string | undefined;
  location?: ListingLocationInput | undefined;
  rentalPricePerDay?: number | undefined;
  rentalPricePerWeek?: number | undefined;
  depositAmount?: number | undefined;
}

// spec 02 E-10 — confined to DRAFT/REJECTED by guardEditableModerationState,
// so this never writes a status field (an approved listing must be
// withdrawn first, E-12 — not implemented in this pass). CAR_EDITED audits
// only the changed field *names*, never their values (design §7.3-style
// redaction intent applied to ordinary content, not just secrets).
export async function updateListing(carId: string, actor: ActorContext, input: UpdateListingInput): Promise<CarE> {
  if (Object.keys(input).length === 0) {
    throw new ValidationError('At least one field is required.', { source: 'body', fieldErrors: {} });
  }
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadOwnCarOrThrow(carId, actor, session);
      await runGuards([guardEditableModerationState], car, actor, session);

      const changingRegistration = input.registrationNumber !== undefined && input.registrationNumber !== car.registrationNumber;
      const changingPrice =
        input.rentalPricePerDay !== undefined || input.rentalPricePerWeek !== undefined || input.depositAmount !== undefined;

      Object.assign(car, input);

      if (changingRegistration) {
        await runGuards([guardRegistrationAvailable], car, actor, session);
      }
      if (changingPrice) {
        await runGuards([guardNoLiveRentalOnPriceChange], car, actor, session);
      }

      await car.save({ session });

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'CAR_EDITED',
            entityType: 'CAR',
            entityId: car._id,
            metadata: { changedFields: Object.keys(input) },
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      result = car;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 02 E-16 — a true hard delete, permitted only for a listing no admin
// has ever moderated, that was never published, and that no booking has ever
// referenced. Anything else must go through delist (E-13) instead. The audit
// row is written *before* the delete, in the same transaction, per spec.
export async function deleteListing(carId: string, actor: ActorContext): Promise<{ id: string; deleted: true }> {
  const session = await mongoose.startSession();
  try {
    let carId2!: string;
    await session.withTransaction(async () => {
      const car = await loadOwnCarOrThrow(carId, actor, session);
      await runGuards([guardNeverModerated, guardNeverPublished, guardNoBookingsEver], car, actor, session);

      await AuditLog.create(
        [
          {
            actor: actor.userId,
            actorRole: actor.role,
            action: 'CAR_DELETED',
            entityType: 'CAR',
            entityId: car._id,
            previousState: car.moderationStatus,
            ipAddress: actor.ip,
          },
        ],
        { session },
      );

      await Car.deleteOne({ _id: car._id }).session(session);
      carId2 = String(car._id);
    });
    return { id: carId2, deleted: true };
  } finally {
    await session.endSession();
  }
}

export interface ListOwnListingsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  moderationStatus?: string[] | undefined;
  listingState?: string[] | undefined;
}

const LISTINGS_SORT_WHITELIST: Record<string, Record<string, 1 | -1>> = {
  'createdAt:desc': { createdAt: -1 },
  'updatedAt:desc': { updatedAt: -1 },
  'rentalPricePerDay:asc': { rentalPricePerDay: 1 },
  'rentalPricePerDay:desc': { rentalPricePerDay: -1 },
};

// spec 02 E-14 — scopeToActor('owner'), mandatory per TR-05: every list
// endpoint under /api/user is constrained to the caller's own records.
export async function listOwnListings(actor: ActorContext, query: ListOwnListingsQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;
  const sortKey = query.sort && LISTINGS_SORT_WHITELIST[query.sort] ? query.sort : 'createdAt:desc';

  const filter: FilterQuery<CarDoc> = { owner: actor.userId };
  if (query.moderationStatus?.length) {
    filter.moderationStatus = { $in: query.moderationStatus as CarDoc['moderationStatus'][] };
  }
  if (query.listingState?.length) {
    filter.listingState = { $in: query.listingState as CarDoc['listingState'][] };
  }

  const [data, total] = await Promise.all([
    Car.find(filter)
      .sort({ ...LISTINGS_SORT_WHITELIST[sortKey], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Car.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, sort: sortKey },
  };
}

export async function approveCar(carId: string, actor: ActorContext): Promise<CarE> {
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadCarOrThrow(carId, session);
      result = await transition({
        registry: carRegistry,
        entityType: 'CAR',
        field: 'moderationStatus',
        entity: car,
        to: 'APPROVED',
        actor,
        session,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function rejectCar(carId: string, reason: string, actor: ActorContext): Promise<CarE> {
  if (!reason || !reason.trim()) {
    throw new ValidationError('A reason is required to reject a listing.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required'] },
    });
  }
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadCarOrThrow(carId, session);
      car.rejectionReason = reason;
      result = await transition({
        registry: carRegistry,
        entityType: 'CAR',
        field: 'moderationStatus',
        entity: car,
        to: 'REJECTED',
        actor,
        session,
        reason,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function publishCar(carId: string, actor: ActorContext): Promise<CarE> {
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadCarOrThrow(carId, session);
      result = await transition({
        registry: carRegistry,
        entityType: 'CAR',
        field: 'listingState',
        entity: car,
        to: 'LISTED',
        actor,
        session,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function delistCar(carId: string, reason: string, actor: ActorContext): Promise<CarE> {
  if (!reason || !reason.trim()) {
    throw new ValidationError('A reason is required to delist a listing.', {
      source: 'body',
      fieldErrors: { reason: ['reason is required'] },
    });
  }
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadCarOrThrow(carId, session);
      car.delistedReason = reason;
      result = await transition({
        registry: carRegistry,
        entityType: 'CAR',
        field: 'listingState',
        entity: car,
        to: 'DELISTED',
        actor,
        session,
        reason,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function relistCar(carId: string, actor: ActorContext): Promise<CarE> {
  const session = await mongoose.startSession();
  try {
    let result!: CarE;
    await session.withTransaction(async () => {
      const car = await loadCarOrThrow(carId, session);
      result = await transition({
        registry: carRegistry,
        entityType: 'CAR',
        field: 'listingState',
        entity: car,
        to: 'LISTED',
        actor,
        session,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}
