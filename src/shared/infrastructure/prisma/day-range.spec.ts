import type { ListCriteria } from '../../domain/listing/list-criteria';
import { dayDate, dayRange, dayString, toDay } from './day-range';

const criteria = (from?: Date, to?: Date): ListCriteria => ({
  q: '',
  from,
  to,
  order: 'desc',
  window: { skip: 0, take: 10 },
});

describe('day-range', () => {
  it('maps a day to the UTC midnight of a date column and back', () => {
    expect(dayDate('2026-10-25').toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(dayString(new Date('2026-10-25T00:00:00Z'))).toBe('2026-10-25');
  });

  it('takes the Lima day of an instant', () => {
    expect(dayString(toDay(new Date('2026-10-26T03:00:00Z')))).toBe('2026-10-25');
    expect(dayString(toDay(new Date('2026-10-26T05:00:00Z')))).toBe('2026-10-26');
  });

  it('builds the date range of the criteria bounds', () => {
    const from = new Date('2026-10-01T05:00:00Z');
    const to = new Date('2026-10-26T05:00:00Z');
    expect(dayRange(criteria())).toBeUndefined();
    expect(dayRange(criteria(from, to))).toEqual({
      gte: dayDate('2026-10-01'),
      lt: dayDate('2026-10-26'),
    });
    expect(dayRange(criteria(from))).toEqual({ gte: dayDate('2026-10-01') });
    expect(dayRange(criteria(undefined, to))).toEqual({ lt: dayDate('2026-10-26') });
  });
});
