import { Router } from 'express';
import { z } from 'zod';
import { getProfile, updateProfile } from '../services/user.service.js';

const router = Router();

// spec 02 E-26 — email, role, kycStatus, isActive are absent from this DTO
// entirely (D10): a strictObject rejects them as unknown keys, 400, never a
// silently stripped field.
const updateProfileBody = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined, { message: 'At least one field is required.' });

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
