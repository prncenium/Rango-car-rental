import { z } from 'zod';
import { objectIdSchema } from '../lib/objectId.js';
import { ROLES } from '../enums/role.enum.js';

export const drivingLicenceSchema = z.object({
  number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9- ]{8,20}$/, 'Invalid driving licence number'),
  expiryDate: z.coerce.date().optional(),
  enteredAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
});

export const userEntitySchema = z.object({
  _id: objectIdSchema,
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1),
  passwordHash: z.string().min(1),
  role: z.enum(ROLES).default('USER'),
  isActive: z.boolean().default(true),
  drivingLicence: drivingLicenceSchema,
  failedLoginCount: z.number().int().min(0).default(0),
  lockedUntil: z.coerce.date().optional(),
  lastFailedLoginAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type DrivingLicence = z.infer<typeof drivingLicenceSchema>;
export type UserEntity = z.infer<typeof userEntitySchema>;
