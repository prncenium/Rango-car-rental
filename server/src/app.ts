import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { requireActiveSession, requireAdmin, requireAuth, requireSuperAdmin } from './middleware/auth.js';
import { requireCsrf } from './middleware/csrf.js';
import { adminRateLimit, authRateLimit, contactRateLimit, publicRateLimit, userRateLimit } from './middleware/rateLimit.js';
import { authRoutes } from './routes/auth.routes.js';
import { adminCarRoutes } from './routes/admin.car.routes.js';
import { adminBookingRoutes } from './routes/admin.booking.routes.js';
import { adminPaymentRoutes } from './routes/admin.payment.routes.js';
import { adminUserRoutes } from './routes/admin.user.routes.js';
import { adminAuditRoutes } from './routes/admin.audit.routes.js';
import { adminQueueRoutes } from './routes/admin.queue.routes.js';
import { userListingRoutes } from './routes/user.listing.routes.js';
import { userBookingRoutes } from './routes/user.booking.routes.js';
import { userProfileRoutes } from './routes/user.profile.routes.js';
import { publicCarRoutes } from './routes/public.car.routes.js';
import { publicLegalRoutes } from './routes/public.legal.routes.js';
import { publicContactRoutes } from './routes/public.contact.routes.js';
import { superAdminRoutes } from './routes/superadmin.routes.js';

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

  // /api/public: unauthenticated, read-only, serving only
  // moderationStatus=APPROVED && listingState=LISTED cars (design INV-1,
  // spec 02 §9). No auth middleware — this is the one namespace with none.
  // spec 02 §5 — relaxed bucket: unauthenticated, IP-keyed, high ceiling.
  app.use('/api/public/cars', publicRateLimit, publicCarRoutes);
  app.use('/api/public/legal', publicRateLimit, publicLegalRoutes);
  app.use('/api/public/contact', contactRateLimit, publicContactRoutes);

  // /api/auth: register, login, refresh, logout, me. Mounted ahead of
  // /api/user and /api/admin (AUTH-09) — none of its own routes carry
  // requireAuth except GET /me, which gates itself. Strict bucket — this is
  // the credential-stuffing / account-enumeration surface (spec 02 §5).
  app.use('/api/auth', authRateLimit, authRoutes);

  // Route modules mount here as later blocks add them (CAR, BOOK, ...).
  // /api/admin: every route requires an active ADMIN/SUPER_ADMIN actor
  // (AUTHZ-1/2, design D11) — requireAuth populates req.actor, requireAdmin
  // narrows the role, requireActiveSession closes the access-token
  // revocation gap (spec 03 §4.5 option b — a revoked admin session must
  // stop mattering immediately, not after the token's own 15-minute expiry).
  // requireCsrf gates every non-GET (spec 02 §6.2/§8.4).
  app.use(
    '/api/admin/listings',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminCarRoutes,
  );
  app.use(
    '/api/admin/bookings',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminBookingRoutes,
  );
  app.use(
    '/api/admin/payments',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminPaymentRoutes,
  );
  app.use(
    '/api/admin/users',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminUserRoutes,
  );
  app.use(
    '/api/admin/audit',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminAuditRoutes,
  );
  app.use(
    '/api/admin/dashboard',
    requireAuth,
    requireAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    adminQueueRoutes,
  );

  // /api/superadmin: SUPER_ADMIN only (spec 03 §2.7, §11) — admin
  // provisioning and SystemConfig. requireSuperAdmin narrows past
  // requireAdmin's ADMIN|SUPER_ADMIN check to SUPER_ADMIN alone.
  // requireActiveSession and requireCsrf apply here too (spec 03 §2.7: "CSRF
  // on every non-GET"; §4.5's option-b split names /api/superadmin
  // alongside /api/admin).
  app.use(
    '/api/superadmin',
    requireAuth,
    requireSuperAdmin,
    requireActiveSession,
    adminRateLimit,
    requireCsrf,
    superAdminRoutes,
  );

  // /api/user: any authenticated, active USER/ADMIN/SUPER_ADMIN — every
  // record is scoped to the caller (spec 02 §6.3), enforced inside each
  // service (ownership -> 404, never a broader listing). Standard bucket,
  // actor-keyed; requireCsrf gates every non-GET.
  app.use('/api/user/listings', requireAuth, userRateLimit, requireCsrf, userListingRoutes);
  app.use('/api/user/bookings', requireAuth, userRateLimit, requireCsrf, userBookingRoutes);
  app.use('/api/user/profile', requireAuth, userRateLimit, requireCsrf, userProfileRoutes);

  // Error handler must be mounted last (design §10.3).
  app.use(errorHandler);

  return app;
}

export const app = createApp();
