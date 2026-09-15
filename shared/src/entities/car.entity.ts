import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { CAR_MODERATION_STATUSES } from '../enums/carModerationStatus.enum.js';
import { CAR_LISTING_STATES } from '../enums/carListingState.enum.js';
import { CAR_TRANSMISSIONS } from '../enums/carTransmission.enum.js';
import { CAR_FUEL_TYPES } from '../enums/carFuelType.enum.js';

export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
});

export const carLocationSchema = z.object({
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  geo: geoPointSchema.optional(),
});

export const carEntitySchema = z.object({
  _id: objectIdSchema,
  owner: objectIdSchema,
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.number().int().gte(1000).lte(9999),
  registrationNumber: z.string().trim().toUpperCase().min(1),
  color: z.string().trim().optional(),
  transmission: z.enum(CAR_TRANSMISSIONS),
  fuelType: z.enum(CAR_FUEL_TYPES),
  seats: z.number().int().positive(),
  mileageKm: z.number().min(0),
  images: z.array(z.string()).min(1),
  description: z.string().optional(),
  location: carLocationSchema,
  rentalPricePerDay: z.number().positive(),
  rentalPricePerWeek: z.number().positive().optional(),
  depositAmount: z.number().min(0).optional(),
  moderationStatus: z.enum(CAR_MODERATION_STATUSES).default('DRAFT'),
  listingState: z.enum(CAR_LISTING_STATES).default('UNLISTED'),
  approvedBy: objectIdSchema.optional(),
  approvedAt: z.coerce.date().optional(),
  rejectedBy: objectIdSchema.optional(),
  rejectedAt: z.coerce.date().optional(),
  rejectionReason: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  delistedBy: objectIdSchema.optional(),
  delistedAt: z.coerce.date().optional(),
  delistedReason: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CarEntity = z.infer<typeof carEntitySchema>;
