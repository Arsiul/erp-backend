import { todayOf } from './today';

describe('todayOf', () => {
  it('returns the calendar day in Lima', () => {
    expect(todayOf({ now: () => new Date('2026-10-26T03:00:00Z') })).toBe('2026-10-25');
    expect(todayOf({ now: () => new Date('2026-10-26T05:00:00Z') })).toBe('2026-10-26');
  });
});
