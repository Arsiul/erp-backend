/**
 * Business time zone. Peru has kept UTC-5 without daylight saving since 1994, so a fixed offset
 * gives the same result as the IANA zone and does not depend on the process time zone.
 */
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
/** Milliseconds in a calendar day. */
export const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const shiftToLima = (date: Date): string => new Date(date.getTime() + LIMA_OFFSET_MS).toISOString();

/** `YYYY-MM-DDTHH:mm` in Lima, the date-time format the frontend shows and stores. */
export const formatLimaDateTime = (date: Date): string => shiftToLima(date).slice(0, 16);

/** `YYYY-MM-DD` in Lima. */
export const formatLimaDate = (date: Date): string => shiftToLima(date).slice(0, 10);

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Instant at which the given Lima day starts. Expects a value accepted by `isIsoDay`. */
export const limaDayStart = (day: string): Date =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() - LIMA_OFFSET_MS);

/** Instant at which the day after the given Lima day starts (exclusive upper bound). */
export const limaDayEnd = (day: string): Date => new Date(limaDayStart(day).getTime() + DAY_MS);

/** The calendar day `days` after `day`, both `YYYY-MM-DD`. */
export const addDays = (day: string, days: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to`, both `YYYY-MM-DD` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
