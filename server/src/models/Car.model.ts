import { Schema, model, type Types } from 'mongoose';
import {
  CAR_MODERATION_STATUSES,
  CAR_LISTING_STATES,
  CAR_TRANSMISSIONS,
  CAR_FUEL_TYPES,
  type CarModerationStatus,
  type CarListingState,
  type CarTransmission,
  type CarFuelType,
} from '@rango/shared';

export interface CarDoc {
  owner: Types.ObjectId;
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  color?: string;
  transmission: CarTransmission;
  fuelType: CarFuelType;
  seats: number;
  mileageKm: number;
  images: string[];
  description?: string;
  location: {
    city: string;
    state: string;
    geo?: { type: 'Point'; coordinates: [number, number] };
  };
  rentalPricePerDay: number;
  rentalPricePerWeek?: number;
  depositAmount?: number;
  moderationStatus: CarModerationStatus;
  listingState: CarListingState;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  publishedAt?: Date;
  delistedBy?: Types.ObjectId;
  delistedAt?: Date;
  delistedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CarSchema = new Schema<CarDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    registrationNumber: { type: String, required: true, uppercase: true, trim: true },
    color: { type: String },
    transmission: { type: String, enum: CAR_TRANSMISSIONS, required: true },
    fuelType: { type: String, enum: CAR_FUEL_TYPES, required: true },
    seats: { type: Number, required: true },
    mileageKm: { type: Number, required: true },
    images: { type: [String], required: true },
    description: { type: String },
    location: {
      city: { type: String, required: true },
      state: { type: String, required: true },
      geo: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] }, // [lng, lat]
      },
    },
    rentalPricePerDay: { type: Number, required: true },
    rentalPricePerWeek: { type: Number },
    depositAmount: { type: Number },
    moderationStatus: {
      type: String,
      enum: CAR_MODERATION_STATUSES,
      default: 'DRAFT',
      required: true,
    },
    listingState: {
      type: String,
      enum: CAR_LISTING_STATES,
      default: 'UNLISTED',
      required: true,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    publishedAt: { type: Date },
    delistedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    delistedAt: { type: Date },
    delistedReason: { type: String },
  },
  { timestamps: true },
);

// D3 — partial unique index: a draft does not reserve the plate.
// MongoDB partial-index filters don't support $ne/$not, so the non-DRAFT set is spelled out explicitly.
CarSchema.index(
  { registrationNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      moderationStatus: { $in: CAR_MODERATION_STATUSES.filter((s) => s !== 'DRAFT') },
    },
  },
);
CarSchema.index({ owner: 1 });
CarSchema.index({ owner: 1, moderationStatus: 1 });
CarSchema.index({ moderationStatus: 1, listingState: 1 });
CarSchema.index({ 'location.city': 1, moderationStatus: 1, listingState: 1 });
CarSchema.index({ 'location.geo': '2dsphere' }, { sparse: true });

CarSchema.pre('validate', function (next) {
  const geo = this.location?.geo;
  if (geo?.type && (!geo.coordinates || geo.coordinates.length !== 2)) {
    this.invalidate('location.geo.coordinates', 'coordinates are required when geo.type is set');
  }
  next();
});

export const Car = model<CarDoc>('Car', CarSchema);
