import { z } from 'zod';

// POST /api/public/contact — client/src/pages/public/About.tsx's contact
// form. Single source of truth for both server validation
// (server/src/routes/public.contact.routes.ts) and client-side form
// validation (About.tsx), same split as shared/src/dto/car.ts.
export const contactDto = z.strictObject({
  name: z.string().trim().min(2, 'Enter your full name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().optional(),
  subject: z.string().trim().min(3, 'Let us know what this is about'),
  message: z.string().trim().min(10, 'Add a few more details so we can help').max(5000),
});
export type ContactDto = z.infer<typeof contactDto>;
