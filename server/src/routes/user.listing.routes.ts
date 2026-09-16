import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CAR_LISTING_STATES, CAR_MODERATION_STATUSES, createCarDto, objectIdSchema, updateCarDto } from '@rango/shared';
import {
  addListingImages,
  createListing,
  deleteListing,
  getOwnListing,
  listOwnListings,
  ownerDelistListing,
  submitListing,
  updateListing,
  withdrawListing,
} from '../services/car.service.js';
import { carImageUpload } from '../lib/imageUpload.js';
import { PayloadTooLargeError, ValidationError } from '../lib/errors.js';

const router = Router();

const carIdParams = z.object({ carId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });

// spec 02 E-09/E-10 — owner/status fields are absent here entirely (D10):
// they are never accepted from the body, not merely stripped. `images` URLs
// are format-checked only; the full storage-host allowlist guard
// (guardImageUrlsAllowed, X-B6) is deferred out of this pass. Both schemas
// now live in `@rango/shared` (docs/design/01-technical-design.md §8.1's
// schema-sharing pattern) so the client form validates against the exact
// same rules this route enforces — see shared/src/dto/car.ts for the
// `images` relaxation note (specs/05-ui-ux-public.md §3.7 OQ1, BLOCKING).
const createListingBody = createCarDto;
const updateListingBody = updateCarDto;

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
});

router.post('/', async (req, res, next) => {
  try {
    const body = createListingBody.parse(req.body);
    const car = await createListing(req.actor!, body);
    res.status(201).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await listOwnListings(req.actor!, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:carId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const car = await getOwnListing(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.patch('/:carId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const body = updateListingBody.parse(req.body);
    const car = await updateListing(carId, req.actor!, body);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// spec 02 E-11, exception E1 — DRAFT|REJECTED -> PENDING_APPROVAL.
router.post('/:carId/submit', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    z.strictObject({}).parse(req.body ?? {});
    const car = await submitListing(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// spec 02 E-12, exception E2 — PENDING_APPROVAL|APPROVED -> DRAFT.
router.post('/:carId/withdraw', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    z.strictObject({}).parse(req.body ?? {});
    const car = await withdrawListing(carId, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// spec 02 E-13, exception E3 — LISTED -> DELISTED, owner-triggered.
router.post('/:carId/delist', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const car = await ownerDelistListing(carId, reason, req.actor!);
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

// multer's own errors (size/count limits) arrive as `MulterError`, not our
// DomainError hierarchy — translated here so the error middleware (design
// §10.3) never has to special-case a third-party error type. A fileFilter
// rejection (wrong MIME type) already throws UnsupportedMediaTypeError
// directly, which passes through the `else` branch unchanged.
function multipartCarImages(req: Request, res: Response, next: NextFunction): void {
  carImageUpload.array('images')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new PayloadTooLargeError('Each image must be 5MB or smaller.'));
        return;
      }
      next(new ValidationError(`Invalid image upload: ${err.message}`, { source: 'body', fieldErrors: { images: [err.message] } }));
      return;
    }
    next(err);
  });
}

// docs/design/02-image-storage.md — POST /api/user/listings/:carId/images
router.post('/:carId/images', multipartCarImages, async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const car = await addListingImages(
      carId,
      req.actor!,
      files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
    );
    res.status(200).json({ data: car });
  } catch (err) {
    next(err);
  }
});

router.delete('/:carId', async (req, res, next) => {
  try {
    const { carId } = carIdParams.parse(req.params);
    const result = await deleteListing(carId, req.actor!);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export { router as userListingRoutes };
