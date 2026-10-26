import { Prisma } from '../../../generated/prisma/client';
import { dayBounds, equalsFilter } from './sql-fragments';

const column = Prisma.sql`s.issued_at`;
const squash = (fragment: Prisma.Sql): string => fragment.sql.replace(/\s+/g, ' ').trim();

describe('sql fragments', () => {
  it('bounds a column by both days, sent as parameters', () => {
    const fragment = dayBounds(column, '2026-10-01', '2026-10-25');
    expect(squash(fragment)).toBe('AND s.issued_at >= ?::date AND s.issued_at <= ?::date');
    expect(fragment.values).toEqual(['2026-10-01', '2026-10-25']);
  });

  it('keeps only the bounds present', () => {
    expect(squash(dayBounds(column, '2026-10-01'))).toBe('AND s.issued_at >= ?::date');
    expect(squash(dayBounds(column, undefined, '2026-10-25'))).toBe('AND s.issued_at <= ?::date');
    expect(squash(dayBounds(column))).toBe('');
  });

  it('compares with a value only when there is one', () => {
    const fragment = equalsFilter(Prisma.sql`s.customer_id`, 'c-1');
    expect(squash(fragment)).toBe('AND s.customer_id = ?');
    expect(fragment.values).toEqual(['c-1']);
    expect(equalsFilter(Prisma.sql`s.customer_id`)).toBe(Prisma.empty);
  });
});
