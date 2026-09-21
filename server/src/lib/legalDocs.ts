import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// docs/legal/terms-and-conditions.md is the single source of truth for
// rental T&Cs — read fresh on every call (no caching, no bundling into the
// client) so an edit to that file takes effect everywhere — the rental
// agreement PDF, the public terms endpoint, the Listing Detail highlights —
// on the very next request, with nothing to invalidate.
const TERMS_PATH = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'docs', 'legal', 'terms-and-conditions.md');

export function getTermsAndConditionsMarkdown(): string {
  return readFileSync(TERMS_PATH, 'utf-8');
}
