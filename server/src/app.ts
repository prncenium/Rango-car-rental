import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { adminCarRoutes } from './routes/admin.car.routes.js';
import { adminBookingRoutes } from './routes/admin.booking.routes.js';
import { adminUserRoutes } from './routes/admin.user.routes.js';
import { adminAuditRoutes } from './routes/admin.audit.routes.js';
import { adminQueueRoutes } from './routes/admin.queue.routes.js';

// No `listen` here (design §3) so Supertest can import this directly
// without binding a port.
export function createApp(): Express {
  const app = express();

  app.use(requestContext);
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ data: { status: 'ok' } });
  });

  // Route modules mount here as later blocks add them (AUTH, CAR, BOOK, ...).
  // /api/admin: every route requires an active ADMIN/SUPER_ADMIN actor
  // (AUTHZ-1/2, design D11) — requireAuth populates req.actor, requireAdmin
  // narrows the role.
  app.use('/api/admin/listings', requireAuth, requireAdmin, adminCarRoutes);
  app.use('/api/admin/bookings', requireAuth, requireAdmin, adminBookingRoutes);
  app.use('/api/admin/users', requireAuth, requireAdmin, adminUserRoutes);
  app.use('/api/admin/audit', requireAuth, requireAdmin, adminAuditRoutes);
  app.use('/api/admin/dashboard', requireAuth, requireAdmin, adminQueueRoutes);

  // Error handler must be mounted last (design §10.3).
  app.use(errorHandler);

  return app;
}

export const app = createApp();
