import { cn } from '../ui/cn';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import {
  addMonthsIso,
  daysBetweenInclusive,
  daysInMonth,
  fromIso,
  MONTH_LABELS,
  monthStartIso,
  toIso,
  WEEKDAY_LABELS,
} from '../../lib/dateUtc';

/**
 * Month-grid calendar rendering blocked days uniformly, shared between
 * Listing Detail (readonly) and the Booking Request Flow (selectable) so
 * the blocked-day rendering can never drift between the two surfaces (spec
 * 05 §4 component hierarchy, §3.3's "leakage rule": a blocked day renders
 * identically regardless of *why* it's blocked — no tooltip or label may
 * say booked vs. maintenance vs. anything else).
 */
export interface AvailabilityCalendarProps {
  /** First-of-month, YYYY-MM-DD, controlled by the caller so it can refetch availability on navigation. */
  visibleMonth: string;
  onVisibleMonthChange: (nextMonth: string) => void;
  blockedDays: ReadonlySet<string>;
  todayIsoValue: string;
  /** Earliest selectable day (inclusive), e.g. today. Days before this are disabled. */
  minSelectableIso?: string;
  /** Latest selectable day (inclusive). Days after this are disabled. */
  maxSelectableIso?: string;
  mode: 'readonly' | 'selectable';
  /** Inclusive pickup/last-day-held selection — the flow adds one day for the API's half-open endDate. */
  selectedStart?: string | undefined;
  selectedEnd?: string | undefined;
  onSelect?: (start: string | undefined, end: string | undefined) => void;
}

export function AvailabilityCalendar({
  visibleMonth,
  onVisibleMonthChange,
  blockedDays,
  todayIsoValue,
  minSelectableIso,
  maxSelectableIso,
  mode,
  selectedStart,
  selectedEnd,
  onSelect,
}: AvailabilityCalendarProps) {
  const monthDate = fromIso(visibleMonth);
  const year = monthDate.getUTCFullYear();
  const monthIndex0 = monthDate.getUTCMonth();
  const firstWeekday = monthDate.getUTCDay();
  const totalDays = daysInMonth(year, monthIndex0);

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => toIso(new Date(Date.UTC(year, monthIndex0, i + 1)))),
  ];

  const inRangeSet = new Set(
    selectedStart && selectedEnd ? daysBetweenInclusive(selectedStart, selectedEnd) : [],
  );

  const todayMonthStart = monthStartIso(fromIso(todayIsoValue).getUTCFullYear(), fromIso(todayIsoValue).getUTCMonth());
  const canGoToPrevMonth = addMonthsIso(visibleMonth, -1) >= todayMonthStart;

  function isDisabled(iso: string): boolean {
    if (iso < todayIsoValue) return true;
    if (minSelectableIso && iso < minSelectableIso) return true;
    if (maxSelectableIso && iso > maxSelectableIso) return true;
    return blockedDays.has(iso);
  }

  function handleClick(iso: string) {
    if (mode !== 'selectable' || !onSelect || isDisabled(iso)) return;

    if (!selectedStart || (selectedStart && selectedEnd)) {
      onSelect(iso, undefined);
      return;
    }

    if (iso < selectedStart) {
      onSelect(iso, undefined);
      return;
    }

    const spanned = daysBetweenInclusive(selectedStart, iso);
    const crossesBlocked = spanned.some((d) => blockedDays.has(d));
    if (crossesBlocked) {
      onSelect(iso, undefined);
      return;
    }

    onSelect(selectedStart, iso);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onVisibleMonthChange(addMonthsIso(visibleMonth, -1))}
          disabled={!canGoToPrevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-neutral-600 hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-neutral-300"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-body-sm font-medium text-neutral-800">
          {MONTH_LABELS[monthIndex0]} {year}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onVisibleMonthChange(addMonthsIso(visibleMonth, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-neutral-600 hover:bg-surface-sunken"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="text-caption font-medium text-neutral-400">
            {w}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (!iso) return <span key={`blank-${i}`} />;

          const disabled = isDisabled(iso);
          const isBlocked = blockedDays.has(iso);
          const isToday = iso === todayIsoValue;
          const isStart = iso === selectedStart;
          const isEnd = iso === selectedEnd;
          const isInRange = inRangeSet.has(iso);
          const dayNum = Number(iso.slice(8, 10));

          return (
            <button
              key={iso}
              type="button"
              disabled={mode !== 'selectable' || disabled}
              onClick={() => handleClick(iso)}
              title={isBlocked ? 'Unavailable' : undefined}
              aria-pressed={isStart || isEnd}
              className={cn(
                'flex h-9 items-center justify-center rounded-sm text-body-sm transition-colors',
                isToday && 'ring-1 ring-inset ring-brand-accent/40',
                isBlocked && 'bg-surface-sunken text-neutral-300 line-through',
                !isBlocked && disabled && 'text-neutral-300',
                !isBlocked && !disabled && mode === 'selectable' && 'text-neutral-800 hover:bg-surface-sunken',
                !isBlocked && !disabled && mode === 'readonly' && 'text-neutral-800',
                (isStart || isEnd) && 'bg-brand-accent text-neutral-0 hover:bg-brand-accent',
                isInRange && !isStart && !isEnd && 'bg-brand-accent-subtle text-brand-primary',
              )}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-caption text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-surface-sunken" aria-hidden="true" />
          Unavailable
        </span>
        {mode === 'selectable' && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-accent" aria-hidden="true" />
            Selected
          </span>
        )}
      </div>
    </div>
  );
}
