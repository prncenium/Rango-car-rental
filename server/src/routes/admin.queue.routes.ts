import { Router } from 'express';
import { getDashboardCounts } from '../services/adminQueue.service.js';

const router = Router();

router.get('/counts', async (_req, res, next) => {
  try {
    const counts = await getDashboardCounts();
    res.status(200).json({ data: counts });
  } catch (err) {
    next(err);
  }
});

export { router as adminQueueRoutes };
