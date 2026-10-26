import type { ListCriteria } from '../../domain/listing/list-criteria';
import { formatLimaDate } from '../../domain/time/lima-time';

/** A `YYYY-MM-DD` day as the UTC midnight Prisma uses for `@db.Date` columns. */
export const dayDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** The `YYYY-MM-DD` of a `@db.Date` value. */
export const dayString = (date: Date): string => date.toISOString().slice(0, 10);

/** The Lima day an instant falls on, as a `@db.Date` value. */
export const toDay = (instant: Date): Date => dayDate(formatLimaDate(instant));

/**
 * `[from, to)` of the list criteria on a `@db.Date` column. The criteria bounds are Lima
 * instants (start of `from`, start of the day after `to`), so they map to whole days.
 */
export function dayRange(criteria: ListCriteria): { gte?: Date; lt?: Date } | undefined {
  if (criteria.from === undefined && criteria.to === undefined) {
    return undefined;
  }
  return {
    ...(criteria.from === undefined ? {} : { gte: toDay(criteria.from) }),
    ...(criteria.to === undefined ? {} : { lt: toDay(criteria.to) }),
  };
}
