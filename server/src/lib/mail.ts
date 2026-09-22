import { Resend } from 'resend';
import { env } from '../config/env.js';
import { ServiceUnavailableError } from './errors.js';

// Contact-us form (client/src/pages/public/About.tsx) -> POST /api/public/contact.
// Sends over Resend's HTTPS API rather than raw SMTP — Render's outbound
// network blocks/hangs on SMTP ports 465 and 587 (confirmed by hand), but
// never HTTPS. RESEND_API_KEY is optional in env.ts on purpose (its own
// note) so a server without it still boots; this is the single place that
// turns "not configured" into a clear 503 instead of a crash.
let client: Resend | undefined;

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new ServiceUnavailableError('Contact-us email is not configured on this server.', {
      reason: 'RESEND_NOT_CONFIGURED',
    });
  }
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }
  return client;
}

export interface ContactMailInput {
  name: string;
  email: string;
  phone?: string | undefined;
  subject: string;
  message: string;
}

// Sent from Resend's shared sandbox sender to CONTACT_RECEIVER_EMAIL, with
// the sender set as replyTo — so an admin can hit "reply" in their inbox and
// it goes straight to the person who filled out the form. Without a verified
// sending domain on the Resend account, this only delivers to the email
// address the Resend account itself was created with (Resend's sandbox-mode
// restriction) — verify a domain to lift that.
export async function sendContactMail(input: ContactMailInput): Promise<void> {
  const resend = getClient();
  const text = [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : undefined,
    '',
    input.message,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const result = await resend.emails.send({
    from: 'Rango Car Rental — Contact form <onboarding@resend.dev>',
    to: env.CONTACT_RECEIVER_EMAIL,
    replyTo: input.email,
    subject: `[Contact] ${input.subject}`,
    text,
  });

  if (result.error) {
    throw new ServiceUnavailableError('Failed to send contact-us email.', {
      reason: 'RESEND_SEND_FAILED',
      cause: result.error.message,
    });
  }
}
