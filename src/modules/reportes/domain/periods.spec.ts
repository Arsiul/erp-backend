import {
  comparisonPeriods,
  lastSixMonths,
  lastThirtyDays,
  periodLabel,
  sixMonthsRange,
} from './periods';

describe('periods', () => {
  it('compares the month so far with the same days of the previous month', () => {
    expect(comparisonPeriods('2026-10-25')).toEqual({
      current: { from: '2026-10-01', to: '2026-10-25' },
      previous: { from: '2026-09-01', to: '2026-09-25' },
    });
  });

  it('caps the previous period at the last day of a shorter month', () => {
    expect(comparisonPeriods('2026-03-31').previous).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(comparisonPeriods('2026-01-15').previous).toEqual({
      from: '2025-12-01',
      to: '2025-12-15',
    });
  });

  it('takes the last 30 days with today included', () => {
    expect(lastThirtyDays('2026-10-25')).toEqual({ from: '2026-09-26', to: '2026-10-25' });
  });

  it('spans the six months of the chart', () => {
    expect(sixMonthsRange('2026-10-25')).toEqual({ from: '2026-05-01', to: '2026-10-31' });
    expect(sixMonthsRange('2026-02-10')).toEqual({ from: '2025-09-01', to: '2026-02-28' });
  });

  it('lists the current month and the five before it, oldest first', () => {
    const months = lastSixMonths('2026-02-10');
    expect(months.map((month) => month.key)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(months[5]).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(months[0]).toMatchObject({ from: '2025-09-01', to: '2025-09-30' });
    for (const month of months) {
      expect(month.label).toMatch(/^\p{L}+$/u);
    }
  });

  it('names the period in Spanish', () => {
    expect(periodLabel('2026-10-25')).toBe('octubre de 2026');
  });
});
