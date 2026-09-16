// Reads the rgo_csrf cookie and attaches it as X-CSRF-Token on mutating requests,
// per docs/design/01-technical-design.md's double-submit CSRF scheme (§2, §8.5).
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)rgo_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}
