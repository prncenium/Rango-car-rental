/**
 * Minimal className joiner — avoids pulling in clsx/tailwind-merge as a
 * dependency for a handful of conditional classes.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
