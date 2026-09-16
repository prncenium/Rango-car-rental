import { Router } from 'express';
import { z } from 'zod';
import { getProfile, updateProfile } from '../services/user.service.js';

const router = Router();

// spec 02 E-26 — email, role, kycStatus, isActive are absent from this DTO
// entirely (D10): a strictObject rejects them as unknown keys, 400, never a
// silently stripped field. `drivingLicenceNumber` is format-only validation
// (spec 03 §5.3/§5.4) — length and character class, never a real-world check
// — mirroring registerDto's rule exactly (shared/src/dto/auth.ts).
const updateProfileBody = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    drivingLicenceNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(8)
      .max(20)
      .regex(/^[A-Z0-9- ]+$/, 'Driving licence number must contain only letters, digits, hyphens, and spaces.')
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.drivingLicenceNumber !== undefined, {
    message: 'At least one field is required.',
  });

router.get('/', async (req, res, next) => {
  try {
    const user = await getProfile(req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const body = updateProfileBody.parse(req.body);
    const user = await updateProfile(req.actor!, body);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

export { router as userProfileRoutes };
