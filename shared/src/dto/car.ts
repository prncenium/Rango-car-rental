import { z } from 'zod';
import { CAR_TRANSMISSIONS } from '../enums/carTransmission.enum.js';
import { CAR_FUEL_TYPES } from '../enums/carFuelType.enum.js';

// docs/design/01-technical-design.md §8.1 — hand-written z.strictObject
// request-shape schemas, never derived from carEntitySchema by .omit()/.pick()
// (D10). This is the single source of truth for both server validation
// (server/src/routes/user.listing.routes.ts) and client-side form validation
// (client/src/pages/user/ListingForm.tsx).

export const CAR_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CAR_IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
// Mirrors SystemConfig.listing.maxImagesPerCar's default (D12) for instant
// client-side rejection — the server re-reads the real, possibly
// superadmin-changed value and is the authority (docs/design/02-image-storage.md).
export const CAR_DEFAULT_MAX_IMAGES_PER_CAR = 12;

export const carLocationDto = z.strictObject({
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  geo: z
    .strictObject({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) })
    .optional(),
});

// spec 02 E-09. Per specs/05-ui-ux-public.md §3.7's open question 1
// (BLOCKING) — createCarDto's `images[>=1]` and the image-upload endpoint's
// requirement of an already-existing carId are mutually exclusive for a
// first-time create. This DTO adopts that document's own stated resolution:
// `images` may be empty at creation (default []); the car is created in
// DRAFT and the client routes straight into edit mode, where the photo
// section becomes reachable. "At least one image before submit" is enforced
// client-side only in this pass (mirroring guardListingComplete's intent) —
// no equivalent server guard exists on POST .../submit yet, which is a
// pre-existing gap, not something introduced here.
export const createCarDto = z
  .strictObject({
    make: z.string().trim().min(1),
    model: z.string().trim().min(1),
    year: z.number().int().gte(1900).lte(9999),
    registrationNumber: z.string().trim().min(1),
    color: z.string().trim().optional(),
    transmission: z.enum(CAR_TRANSMISSIONS),
    fuelType: z.enum(CAR_FUEL_TYPES),
    seats: z.number().int().positive(),
    mileageKm: z.number().min(0),
    images: z.array(z.string().url()).default([]),
    description: z.string().optional(),
    location: carLocationDto,
    rentalPricePerDay: z.number().positive(),
    rentalPricePerWeek: z.number().positive().optional(),
    depositAmount: z.number().min(0).optional(),
  })
  .refine((v) => v.rentalPricePerWeek === undefined || v.rentalPricePerWeek < v.rentalPricePerDay * 7, {
    message: 'rentalPricePerWeek must be less than 7x rentalPricePerDay',
    path: ['rentalPricePerWeek'],
  });
export type CreateCarDto = z.infer<typeof createCarDto>;

// spec 02 E-10 — every field optional, minimum one present. No status field,
// no owner. `images` has no min() here (unlike createCarDto) because a full
// replacement of the array is also how a photo is removed
// (docs/design/02-image-storage.md's "Non-goals" — no separate delete route),
// which must be able to go down to zero while still DRAFT/REJECTED.
export const updateCarDto = z
  .strictObject({
    make: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    year: z.number().int().gte(1900).lte(9999).optional(),
    registrationNumber: z.string().trim().min(1).optional(),
    color: z.string().trim().optional(),
    transmission: z.enum(CAR_TRANSMISSIONS).optional(),
    fuelType: z.enum(CAR_FUEL_TYPES).optional(),
    seats: z.number().int().positive().optional(),
    mileageKm: z.number().min(0).optional(),
    images: z.array(z.string().url()).optional(),
    description: z.string().optional(),
    location: carLocationDto.optional(),
    rentalPricePerDay: z.number().positive().optional(),
    rentalPricePerWeek: z.number().positive().optional(),
    depositAmount: z.number().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });
export type UpdateCarDto = z.infer<typeof updateCarDto>;
