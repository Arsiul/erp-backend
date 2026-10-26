import { BusinessError } from '../errors/domain-error';

/**
 * Rules for the records a form selects, as `requireRecord` and `requireActive` of the frontend
 * mocks: a missing one answers «Selecciona …» and an inactive one cannot be used.
 */

/** The id of a selected record, or «Selecciona …» when it is missing. */
export function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new BusinessError(`Selecciona ${label}.`);
  }
  return value;
}

/** The looked-up record, or «Selecciona …» when it does not exist. */
export function requireFound<T>(record: T | null, label: string): T {
  if (record === null) {
    throw new BusinessError(`Selecciona ${label}.`);
  }
  return record;
}

/** The looked-up record when it exists and is active. */
export function requireActive<T extends { readonly status: string }>(
  record: T | null,
  label: string,
): T {
  const found = requireFound(record, label);
  if (found.status !== 'active') {
    throw new BusinessError(`No puedes usar ${label} porque está en estado inactivo.`);
  }
  return found;
}

/** Looks up the record of a selected id with `find`; see `requireId` and `requireFound`. */
export async function requireRecord<T>(
  id: unknown,
  find: (id: string) => Promise<T | null>,
  label: string,
): Promise<T> {
  return requireFound(await find(requireId(id, label)), label);
}

/** `requireRecord` that also rejects an inactive record. */
export async function requireActiveRecord<T extends { readonly status: string }>(
  id: unknown,
  find: (id: string) => Promise<T | null>,
  label: string,
): Promise<T> {
  return requireActive(await find(requireId(id, label)), label);
}
