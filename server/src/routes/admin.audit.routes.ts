import { Router } from 'express';
import { z } from 'zod';
import { queryAuditLog } from '../services/audit.service.js';

const router = Router();

const auditQuerySchema = z.strictObject({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = auditQuerySchema.parse(req.query);
    const result = await queryAuditLog(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export { router as adminAuditRoutes };
