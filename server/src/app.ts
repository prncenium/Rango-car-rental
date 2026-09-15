import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';

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

  // Route modules mount here as later blocks add them (AUTH, KYC, CAR, ...).

  // Error handler must be mounted last (design §10.3).
  app.use(errorHandler);

  return app;
}

export const app = createApp();
