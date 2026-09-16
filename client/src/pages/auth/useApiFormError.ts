import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../../lib/apiClient';

// Maps the server's error envelope (spec 02 §3.2/§3.3) onto react-hook-form:
// VALIDATION_FAILED's per-field details become field errors, everything else
// (401/403/409/429/500) becomes a form-level banner message. Field names are
// asserted against the caller's known field set so a server-side field the
// form doesn't render never gets silently swallowed as a form error either.
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  if (error.code === 'VALIDATION_FAILED') {
    const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
    const fieldErrors = details?.fieldErrors ?? {};
    let matched = false;
    for (const field of knownFields) {
      const message = fieldErrors[field as string]?.[0];
      if (message) {
        setError(field, { type: 'server', message });
        matched = true;
      }
    }
    return matched ? 'Please fix the highlighted fields.' : error.message;
  }

  if (error.code === 'CONFLICT') {
    const details = error.details as { field?: string } | undefined;
    if (details?.field && (knownFields as readonly string[]).includes(details.field)) {
      setError(details.field as Path<T>, { type: 'server', message: error.message });
      return 'Please fix the highlighted fields.';
    }
  }

  return error.message;
}
