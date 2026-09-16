import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '@rango/shared';
import {
  demoteAdmin,
  getSystemConfig,
  promoteToAdmin,
  promoteToSuperAdmin,
  updateSystemConfig,
} from '../services/superAdmin.service.js';

const router = Router();

const userIdParams = z.object({ userId: objectIdSchema });
const reasonSchema = z.string().min(1).max(500);

// spec 03 §11.3 E-68 — POST /api/superadmin/admins (promote a user to ADMIN)
const promoteAdminBody = z.strictObject({ userId: objectIdSchema, reason: reasonSchema });
router.post('/admins', async (req, res, next) => {
  try {
    const { userId, reason } = promoteAdminBody.parse(req.body);
    const user = await promoteToAdmin(userId, reason, req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

// spec 03 §11.4 E-69 — POST /api/superadmin/admins/:userId/demote
const demoteAdminBody = z.strictObject({ reason: reasonSchema });
router.post('/admins/:userId/demote', async (req, res, next) => {
  try {
    const { userId } = userIdParams.parse(req.params);
    const { reason } = demoteAdminBody.parse(req.body);
    const user = await demoteAdmin(userId, reason, req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

// spec 03 §11.5 E-70 — POST /api/superadmin/admins/:userId/promote-super
const promoteSuperAdminBody = z.strictObject({ reason: reasonSchema, confirmEmail: z.string().email() });
router.post('/admins/:userId/promote-super', async (req, res, next) => {
  try {
    const { userId } = userIdParams.parse(req.params);
    const { reason, confirmEmail } = promoteSuperAdminBody.parse(req.body);
    const user = await promoteToSuperAdmin(userId, reason, confirmEmail, req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

// spec 03 §11.8 E-71 — GET /api/superadmin/config
router.get('/config', async (_req, res, next) => {
  try {
    const config = await getSystemConfig();
    res.status(200).json({ data: config });
  } catch (err) {
    next(err);
  }
});

// spec 03 §11.8 E-72 — PATCH /api/superadmin/config. z.strictObject at every
// level: no key may change an authorization rule, and an unrecognised key is
// a 400, never a silently ignored one (design D10).
const updateConfigBody = z.strictObject({
  booking: z
    .strictObject({
      maxDurationDays: z.number().int().positive().optional(),
      maxAdvanceDays: z.number().int().positive().optional(),
      maxOpenRequestsPerUser: z.number().int().positive().optional(),
      turnaroundBufferDays: z.number().int().min(0).max(7).optional(),
      defaultDepositAmount: z.number().min(0).optional(),
    })
    .optional(),
  availability: z
    .strictObject({
      publicWindowDays: z.number().int().positive().optional(),
    })
    .optional(),
  security: z
    .strictObject({
      adminMaxConcurrentSessions: z.number().int().min(0).optional(),
    })
    .optional(),
  listing: z
    .strictObject({
      maxImagesPerCar: z.number().int().positive().optional(),
    })
    .optional(),
  platform: z
    .strictObject({
      registrationOpen: z.boolean().optional(),
    })
    .optional(),
});

router.patch('/config', async (req, res, next) => {
  try {
    const patch = updateConfigBody.parse(req.body);
    const { config, bookingsUnaffectedByBufferChange } = await updateSystemConfig(patch, req.actor!);
    res.status(200).json({ data: config, meta: { bookingsUnaffectedByBufferChange } });
  } catch (err) {
    next(err);
  }
});

export { router as superAdminRoutes };
