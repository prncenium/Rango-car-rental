import type { ContactDto } from '@rango/shared';
import { apiFetch } from '../lib/apiClient';

// POST /api/public/contact — sends the contact-us form to the operator's
// inbox (server/src/lib/mail.ts). Unauthenticated, rate-limited server-side.
export function sendContactMessage(input: ContactDto): Promise<{ sent: true }> {
  return apiFetch<{ sent: true }>('/public/contact', { method: 'POST', body: input });
}
