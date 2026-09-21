import { Router } from 'express';
import { getTermsAndConditionsMarkdown } from '../lib/legalDocs.js';

const router = Router();

// GET /api/public/legal/terms — unauthenticated, read-only, same rate
// bucket as the rest of /api/public (this file's own content is the whole
// point of exposing it publicly: a renter should be able to read it before
// ever logging in). Returns the raw markdown; rendering (headings, lists)
// is a client concern, same split as the rental agreement PDF's own
// plain-text conversion of the identical source file.
router.get('/terms', (_req, res) => {
  res.status(200).json({ data: { markdown: getTermsAndConditionsMarkdown() } });
});

export { router as publicLegalRoutes };
