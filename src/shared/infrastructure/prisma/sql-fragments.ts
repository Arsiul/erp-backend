import { Prisma } from '../../../generated/prisma/client';

/**
 * `AND <column> >= from AND <column> <= to`, for the bounds present. `column` is a
 * static fragment written by the adapter; the days always travel as parameters.
 */
export function dayBounds(column: Prisma.Sql, from?: string, to?: string): Prisma.Sql {
  const lower = from === undefined ? Prisma.empty : Prisma.sql`AND ${column} >= ${from}::date`;
  const upper = to === undefined ? Prisma.empty : Prisma.sql`AND ${column} <= ${to}::date`;
  return Prisma.sql`${lower} ${upper}`;
}

/** `AND <column> = value` when there is a value to compare with. */
export function equalsFilter(column: Prisma.Sql, value?: string): Prisma.Sql {
  return value === undefined ? Prisma.empty : Prisma.sql`AND ${column} = ${value}`;
}
