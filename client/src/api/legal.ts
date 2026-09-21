import { apiFetch } from '../lib/apiClient';

// GET /api/public/legal/terms — unauthenticated, same source file as the
// rental agreement PDF (docs/legal/terms-and-conditions.md). Returns the
// raw markdown; TermsModal does the (very light) heading/paragraph rendering.
export function getTermsAndConditions(): Promise<{ markdown: string }> {
  return apiFetch<{ markdown: string }>('/public/legal/terms');
}
