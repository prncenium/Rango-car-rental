import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { ServiceUnavailableError } from './errors.js';

// Contact-us form (client/src/pages/public/About.tsx) -> POST /api/public/contact.
// SMTP_USER/SMTP_PASS are optional in env.ts on purpose (server/src/config/env.ts's
// note) so a server without them still boots; this is the single place that
// turns "not configured" into a clear 503 instead of a crash.
let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new ServiceUnavailableError('Contact-us email is not configured on this server.', {
      reason: 'SMTP_NOT_CONFIGURED',
    });
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export interface ContactMailInput {
  name: string;
  email: string;
  phone?: string | undefined;
  subject: string;
  message: string;
}

// Sent from the configured Gmail account, to itself (CONTACT_RECEIVER_EMAIL),
// with the sender set as replyTo — so an admin can hit "reply" in their inbox
// and it goes straight to the person who filled out the form.
export async function sendContactMail(input: ContactMailInput): Promise<void> {
  const t = getTransporter();
  const text = [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : undefined,
    '',
    input.message,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  await t.sendMail({
    from: `"Rango Car Rental — Contact form" <${env.SMTP_USER}>`,
    to: env.CONTACT_RECEIVER_EMAIL,
    replyTo: input.email,
    subject: `[Contact] ${input.subject}`,
    text,
  });
}
