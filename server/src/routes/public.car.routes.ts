import { Router } from 'express';
import { z } from 'zod';
import { CAR_FUEL_TYPES, CAR_TRANSMISSIONS, objectIdSchema } from '@rango/shared';
import { getPublicAvailability, getPublicCarDetail, listPublicCars } from '../services/publicCar.service.js';

const router = Router();

const carIdParams = z.object({ carId: objectIdSchema });

const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .union([schema, z.array(schema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]));

// spec 02 E-06 §9 publicCarQueryDto — strict: an unrecognised param (including
// moderationStatus/listingState/ownerId/status, which are not fields of this
// schema at all) is a 400, never a silently-ignored filter.
const publicCarQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['rentalPricePerDay:asc', 'rentalPricePerDay:desc', 'publishedAt:desc', 'year:desc', 'seats:asc']).optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(60).optional(),
  make: toArray(z.string().trim().min(1)),
  transmission: toArray(z.enum(CAR_TRANSMISSIONS)),
  fuelType: toArray(z.enum(CAR_FUEL_TYPES)),
  seatsMin: z.coerce.number().int().min(1).max(20).optional(),
  seatsMax: z.coerce.number().int().min(1).max(20).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  availableTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const availabilityQuery = z.strictObject({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// spec 02 E-06 — GET /api/public/cars
router.get('/', async (req, res, next) => {
  try {
    const query = publicCarQuery.parse(req.query);
    const result = await listPublicCars(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// spec 02 E-07 — GET /api/public/cars/:carId
router.get('/:carId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await getPublicCarDetail(carId);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// spec 02 E-08 — GET /api/public/cars/:carId/availability
router.get('/:carId/availability', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const { from, to } = availabilityQuery.parse(req.query);
    const result = await getPublicAvailability(carId, from, to);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export { router as publicCarRoutes };
