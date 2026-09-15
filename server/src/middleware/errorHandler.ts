import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, InternalError, ValidationError } from '../lib/errors.js';

function toDomainError(err: unknown, requestId: string): DomainError {
  if (err instanceof DomainError) {
    return err;
  }
  if (err instanceof ZodError) {
    return new ValidationError('Request failed validation.', { fieldErrors: err.flatten() });
  }
  // Anything else is unexpected: logged internally with the request id, but
  // its message/stack never reach the client (design §10.3).
  console.error(`[${requestId}] Unhandled error`, err);
  return new InternalError('An unexpected error occurred.');
}

// The one Express error handler in the app (design §10.3, §7.1's
// explicit-write philosophy applies here too: one place, not scattered
// try/catch-and-next blocks per route).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id ?? '';
  const domainError = toDomainError(err, requestId);

  res.status(domainError.httpStatus).json({
    error: {
      code: domainError.code,
      message: domainError.message,
      details: domainError.details,
      requestId,
    },
  });
}
