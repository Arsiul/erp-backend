import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Prisma } from '../../../generated/prisma/client';

/** Case-insensitive equality used by the uniqueness lookups. */
export const sameValue = (value: string): { equals: string; mode: 'insensitive' } => ({
  equals: value.trim(),
  mode: 'insensitive',
});

/** Excludes the record being edited from a uniqueness lookup. */
export const except = (id: string | undefined): { NOT?: { id: string } } =>
  id === undefined ? {} : { NOT: { id } };

/** True when any relation count of `_count` is above zero. */
export const anyReference = (counts: Readonly<Record<string, number>> | undefined): boolean =>
  counts !== undefined && Object.values(counts).some((count) => count > 0);

/**
 * Foreign keys are the last guard against a delete racing a new reference: the violation answers
 * 422 with the same message as the in-use rule that lost the race.
 */
export async function translateForeignKeyViolation<T>(
  work: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BusinessError(message);
    }
    throw error;
  }
}
