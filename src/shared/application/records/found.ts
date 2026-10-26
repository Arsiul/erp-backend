import { NotFoundError } from '../../domain/errors/domain-error';

/** The record, or a 404 when it does not exist. */
export function found<T>(record: T | null): T {
  if (record === null) {
    throw new NotFoundError();
  }
  return record;
}
