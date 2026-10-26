import {
  addDays,
  DAY_MS,
  daysBetween,
  formatLimaDate,
  formatLimaDateTime,
  isIsoDay,
  limaDayEnd,
  limaDayStart,
} from './lima-time';

describe('lima time', () => {
  it('formats instants in UTC-5', () => {
    const instant = new Date('2026-03-01T03:30:00Z');
    expect(formatLimaDateTime(instant)).toBe('2026-02-28T22:30');
    expect(formatLimaDate(instant)).toBe('2026-02-28');
  });

  it('validates calendar days', () => {
    expect(isIsoDay('2026-02-28')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-2-1')).toBe(false);
    expect(isIsoDay('mañana')).toBe(false);
  });

  it('turns a Lima day into a half-open UTC range', () => {
    expect(limaDayStart('2026-02-28').toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(limaDayEnd('2026-02-28').toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });

  it('adds whole days to a calendar day', () => {
    expect(addDays('2026-10-25', 30)).toBe('2026-11-24');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts the days between two calendar days', () => {
    expect(DAY_MS).toBe(86_400_000);
    expect(daysBetween('2026-10-20', '2026-10-25')).toBe(5);
    expect(daysBetween('2026-10-25', '2026-10-20')).toBe(-5);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});
