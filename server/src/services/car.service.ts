import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Car, type CarDoc } from '../models/Car.model.js';
import { transition } from '../transitions/transition.js';
import { carRegistry } from '../transitions/registry.js';

type CarE = HydratedDocument<CarDoc>;

async function loadCarOrThrow(carId: string, session: ClientSession): Promise<CarE> {
  const car = await Car.findById(carId).session(session);
  if (!car) {
    throw new NotFoundError('Car not found.');
  }
  return car;
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
