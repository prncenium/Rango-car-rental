import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '@rango/shared';
import { deactivateUser, reactivateUser } from '../services/user.service.js';

const router = Router();

const userIdParams = z.object({ userId: objectIdSchema });
const reasonBody = z.strictObject({ reason: z.string().min(1).max(500) });

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
