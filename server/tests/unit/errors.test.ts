import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import * as errors from '../../src/lib/errors.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const statusTable: Array<[new (message: string, details?: unknown) => errors.DomainError, string, number]> = [
  [errors.ValidationError, 'VALIDATION_FAILED', 400],
  [errors.AuthError, 'UNAUTHENTICATED', 401],
  [errors.AccountInactiveError, 'ACCOUNT_INACTIVE', 403],
  [errors.ForbiddenError, 'FORBIDDEN', 403],
  [errors.ForbiddenTransitionError, 'FORBIDDEN_TRANSITION', 403],
  [errors.NotFoundError, 'NOT_FOUND', 404],
  [errors.MethodNotAllowedError, 'METHOD_NOT_ALLOWED', 405],
  [errors.ConflictError, 'CONFLICT', 409],
  [errors.InvalidTransitionError, 'INVALID_TRANSITION', 409],
  [errors.GuardFailedError, 'GUARD_FAILED', 409],
  [errors.PayloadTooLargeError, 'PAYLOAD_TOO_LARGE', 413],
  [errors.UnsupportedMediaTypeError, 'UNSUPPORTED_MEDIA_TYPE', 415],
  [errors.RateLimitedError, 'RATE_LIMITED', 429],
  [errors.InternalError, 'INTERNAL', 500],
  [errors.ServiceUnavailableError, 'SERVICE_UNAVAILABLE', 503],
];

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('DomainError hierarchy (INF-03)', () => {
  it.each(statusTable)('%s maps to code %s and status %d', (ErrorClass, code, httpStatus) => {
    const err = new ErrorClass('message');
    expect(err.code).toBe(code);
    expect(err.httpStatus).toBe(httpStatus);
  });
});

describe('errorHandler (INF-03)', () => {
  it('serialises a DomainError using its own code/status/details', () => {
    const req = { id: 'req-1' } as Request;
    const res = fakeRes();
    const err = new errors.GuardFailedError('Cannot activate booking: payment not settled.', {
      guard: 'guardPaymentCovered',
    });

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'GUARD_FAILED',
        message: 'Cannot activate booking: payment not settled.',
        details: { guard: 'guardPaymentCovered' },
        requestId: 'req-1',
      },
    });
  });

  it('converts an unexpected error to an opaque 500 with no internal message leak', () => {
    const req = { id: 'req-2' } as Request;
    const res = fakeRes();
    const secret = 'raw stack trace / internal db error text';
    const err = new TypeError(secret);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const [payload] = (res.json as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { error: { code: string; message: string } },
    ];
    expect(payload.error.code).toBe('INTERNAL');
    expect(payload.error.message).not.toContain(secret);
    consoleSpy.mockRestore();
  });
});
