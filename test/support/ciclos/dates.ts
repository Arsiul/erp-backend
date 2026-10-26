/**
 * Same date arithmetic as the frontend mock (`erp-frontend/src/services/mocks/business/context.ts`,
 * `isoDate` 83-87 and `addDays` 97-100), so expected due dates come from the frontend rule.
 */
export function addDays(iso: string, days: number): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${mm}-${dd}`;
}

/** The calendar day of an ISO date or date-time. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
