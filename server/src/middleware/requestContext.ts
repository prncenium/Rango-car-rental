import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

// Design §10.3: requestId is always generated server-side; a client-supplied
// X-Request-Id is ignored so it can never be forged into server logs.
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
