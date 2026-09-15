// Design §10.1 — the DomainError hierarchy. Every subclass's `message` is
// assumed safe to send to a client: it is written deliberately by app code,
// never derived from an unexpected exception (see middleware/errorHandler.ts).
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
}

export class AuthError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly httpStatus = 401;
}

export class AccountInactiveError extends DomainError {
  readonly code = 'ACCOUNT_INACTIVE';
  readonly httpStatus = 403;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}

export class ForbiddenTransitionError extends DomainError {
  readonly code = 'FORBIDDEN_TRANSITION';
  readonly httpStatus = 403;
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class MethodNotAllowedError extends DomainError {
  readonly code = 'METHOD_NOT_ALLOWED';
  readonly httpStatus = 405;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  readonly httpStatus = 409;
}

export class GuardFailedError extends DomainError {
  readonly code = 'GUARD_FAILED';
  readonly httpStatus = 409;
}

export class PayloadTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly httpStatus = 413;
}

export class UnsupportedMediaTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
  readonly httpStatus = 415;
}

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly httpStatus = 429;
}

export class InternalError extends DomainError {
  readonly code = 'INTERNAL';
  readonly httpStatus = 500;
}

export class ServiceUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly httpStatus = 503;
}
