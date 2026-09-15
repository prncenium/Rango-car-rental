import { Router } from 'express';
import { z } from 'zod';
import { CAR_LISTING_STATES, CAR_MODERATION_STATUSES, objectIdSchema } from '@rango/shared';
import {
  adminGetListing,
  adminListListings,
  approveCar,
  delistCar,
  publishCar,
  rejectCar,
  relistCar,
} from '../services/car.service.js';
import { createAvailabilityBlock, deleteAvailabilityBlock } from '../services/availability.service.js';

const router = Router();

const carIdParams = z.object({ carId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });
const blockBody = z.strictObject({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500),
  force: z.boolean().optional(),
});

// ADM-03 — admin read endpoints. Unlike /api/user/listings, this namespace
// has no ownership scope: an admin may list and inspect any car in any
// moderation×listing combination, including DRAFT.
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt:desc', 'updatedAt:desc', 'rentalPricePerDay:asc', 'rentalPricePerDay:desc']).optional(),
  moderationStatus: z
    .union([z.enum(CAR_MODERATION_STATUSES), z.array(z.enum(CAR_MODERATION_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  listingState: z
    .union([z.enum(CAR_LISTING_STATES), z.array(z.enum(CAR_LISTING_STATES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  owner: objectIdSchema.optional(),
  city: z.string().min(1).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await adminListListings(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:carId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await adminGetListing(carId);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.post('/:carId/approve', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await approveCar(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.post('/:carId/reject', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const car = await rejectCar(carId, reason, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.post('/:carId/publish', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await publishCar(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.post('/:carId/delist', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const car = await delistCar(carId, reason, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.post('/:carId/relist', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await relistCar(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// spec 04 §1.6 — admin availability blocks (maintenance, personal use, etc.)
router.post('/:carId/availability-blocks', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const body = blockBody.parse(req.body);
    const result = await createAvailabilityBlock(carId, req.actor!, body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/:carId/availability-blocks/:blockId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const blockId = z.string().min(1).parse(req.params.blockId);
    await deleteAvailabilityBlock(carId, blockId, req.actor!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as adminCarRoutes };
