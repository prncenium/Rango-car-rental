import { Router } from 'express';
import { z } from 'zod';
import { ROLES, objectIdSchema } from '@rango/shared';
import { adminGetUser, adminListUsers, deactivateUser, reactivateUser } from '../services/user.service.js';

const router = Router();

const userIdParams = z.object({ userId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });

// spec 02 E-57 — no kycStatus filter (D8 removed the field entirely).
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt:desc', 'name:asc']).optional(),
  role: z
    .union([z.enum(ROLES), z.array(z.enum(ROLES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  isActive: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).max(60).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await adminListUsers(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = userIdParams.parse(req.params);
    const user = await adminGetUser(userId);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

// "suspend"/"ban" both map to the one deactivation edge this platform has
// (User.isActive true -> false) — there is no separate suspended-vs-banned
// state in the resolved domain model (design D11, spec 03 §9).
router.post('/:userId/deactivate', async (req, res, next) => {
  try {
    const { userId } = userIdParams.parse(req.params);
    const { reason } = reasonBody.parse(req.body);
    const user = await deactivateUser(userId, reason, req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

router.post('/:userId/reactivate', async (req, res, next) => {
  try {
    const { userId } = userIdParams.parse(req.params);
    const user = await reactivateUser(userId, req.actor!);
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
});

export { router as adminUserRoutes };
