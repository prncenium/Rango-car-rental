// Calendar-day (YYYY-MM-DD) helpers, UTC-anchored throughout — spec 02 §2.2:
// "Clients never send a timezone-bearing value for a rental day." Every
// consumer of these (availability calendar, booking request flow) works in
// this string form so a browser's local timezone can never shift a day.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDaysIso(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function todayIso(): string {
  const now = new Date();
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

// Half-open [from, to) day span, per spec 02 §2.3.
export function daysBetweenInclusive(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return days;
}

export function diffDays(fromIsoStr: string, toIsoStr: string): number {
  return Math.round((fromIso(toIsoStr).getTime() - fromIso(fromIsoStr).getTime()) / 86_400_000);
}

export function monthStartIso(year: number, monthIndex0: number): string {
  return toIso(new Date(Date.UTC(year, monthIndex0, 1)));
}

export function addMonthsIso(iso: string, n: number): string {
  const d = fromIso(iso);
  const targetMonth = d.getUTCMonth() + n;
  return monthStartIso(d.getUTCFullYear(), targetMonth);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
export { WEEKDAY_LABELS };

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
export { MONTH_LABELS };
