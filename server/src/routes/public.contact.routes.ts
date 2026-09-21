import { Router } from 'express';
import { contactDto } from '@rango/shared';
import { sendContactMail } from '../lib/mail.js';

const router = Router();

// POST /api/public/contact — client/src/pages/public/About.tsx's contact
// form. Unauthenticated, same /api/public rate bucket as the rest of this
// namespace. Mail delivery failures (including "not configured", a 503 from
// sendContactMail) go through `next`, same error-handling shape as every
// other route.
router.post('/', async (req, res, next) => {
  try {
    const body = contactDto.parse(req.body);
    await sendContactMail(body);
    res.status(200).json({ data: { sent: true } });
  } catch (err) {
    next(err);
  }
});

export { router as publicContactRoutes };
