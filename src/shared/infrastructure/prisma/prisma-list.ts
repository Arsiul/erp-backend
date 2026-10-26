import { ConflictError } from '../../domain/errors/domain-error';
import { Prisma } from '../../../generated/prisma/client';
import type { ListCriteria } from '../../domain/listing/list-criteria';

/** Case-insensitive substring filter for the free-text search. */
export const contains = (q: string): { contains: string; mode: 'insensitive' } => ({
  contains: q,
  mode: 'insensitive',
});

/** `[from, to)` on a date column, or nothing when neither bound is set. */
export function dateRange(criteria: ListCriteria): { gte?: Date; lt?: Date } | undefined {
  if (criteria.from === undefined && criteria.to === undefined) {
    return undefined;
  }
  return {
    ...(criteria.from === undefined ? {} : { gte: criteria.from }),
    ...(criteria.to === undefined ? {} : { lt: criteria.to }),
  };
}

/** Order of creation plus the page window. */
export function listWindow(criteria: ListCriteria): {
  orderBy: { seq: 'asc' | 'desc' };
  skip: number;
  take: number;
} {
  const { skip, take } = criteria.window;
  return { orderBy: { seq: criteria.order }, skip, take };
}

/**
 * Unique indexes are the last guard against two concurrent writes with the same value: the
 * violation answers 409 with the same message as the validation that lost the race.
 */
export async function translateUniqueViolation<T>(
  work: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(message);
    }
    throw error;
  }
}
