import { addDays } from '../../../shared/domain/time/lima-time';

const LOCALE = 'es-PE';

/** Inclusive range of calendar days (`YYYY-MM-DD`). */
export interface DayRange {
  readonly from: string;
  readonly to: string;
}

/** A whole calendar month of the dashboard chart. */
export interface MonthSlot extends DayRange {
  /** `YYYY-MM`, the key the monthly aggregations group by. */
  readonly key: string;
  /** Short Spanish month name without the dot ("oct"). */
  readonly label: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const isoOf = (date: Date): string =>
  `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Year, zero-based month and day of a `YYYY-MM-DD` string. */
function partsOf(day: string): { year: number; month: number; date: number } {
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)) - 1,
    date: Number(day.slice(8, 10)),
  };
}

/** Day `date` of the month `month` (may overflow, as Date.UTC does). */
const utcDay = (year: number, month: number, date: number): Date =>
  new Date(Date.UTC(year, month, date));

/**
 * From the 1st of the month to today, and the same days of the previous month (capped at its last
 * day) to compare with. Same rule as `periods()` of the frontend dashboard.
 */
export function comparisonPeriods(today: string): { current: DayRange; previous: DayRange } {
  const { year, month, date } = partsOf(today);
  const previousLastDay = utcDay(year, month, 0).getUTCDate();
  return {
    current: { from: isoOf(utcDay(year, month, 1)), to: today },
    previous: {
      from: isoOf(utcDay(year, month - 1, 1)),
      to: isoOf(utcDay(year, month - 1, Math.min(date, previousLastDay))),
    },
  };
}

/** The last 30 days, today included. */
export const lastThirtyDays = (today: string): DayRange => ({
  from: addDays(today, -29),
  to: today,
});

/** The current month and the five before it, oldest first. */
export function lastSixMonths(today: string): readonly MonthSlot[] {
  const { year, month } = partsOf(today);
  const formatter = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 6 }, (_, index) => {
    const start = utcDay(year, month - 5 + index, 1);
    const end = utcDay(start.getUTCFullYear(), start.getUTCMonth() + 1, 0);
    return {
      key: isoOf(start).slice(0, 7),
      label: formatter.format(start).replace('.', ''),
      from: isoOf(start),
      to: isoOf(end),
    };
  });
}

/** From the first day of the oldest of the last six months to the end of the current month. */
export function sixMonthsRange(today: string): DayRange {
  const { year, month } = partsOf(today);
  return { from: isoOf(utcDay(year, month - 5, 1)), to: isoOf(utcDay(year, month + 1, 0)) };
}

/** "octubre de 2026". */
export function periodLabel(today: string): string {
  const { year, month, date } = partsOf(today);
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDay(year, month, date));
}
