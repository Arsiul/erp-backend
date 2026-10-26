import { BusinessError } from '../errors/domain-error';

/**
 * Field rules shared by every resource, identical to the helpers of the frontend mocks
 * (`requireText`, `optionalText`, `pickEnum`, `activeStatus`).
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireText(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new BusinessError(message);
  }
  return text;
}

export const optionalText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Accepts one of `allowed`; `undefined` or an empty string fall back when a fallback is given. */
export function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  message: string,
  fallback?: T,
): T {
  if ((value === undefined || value === '') && fallback !== undefined) {
    return fallback;
  }
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    throw new BusinessError(message);
  }
  return match;
}

export type ActiveStatus = 'active' | 'inactive';

export const ACTIVE_STATUSES = ['active', 'inactive'] as const satisfies readonly ActiveStatus[];

export const activeStatus = (value: unknown): ActiveStatus =>
  pickEnum(value, ACTIVE_STATUSES, 'El estado no es válido.', 'active');

/** Rules of the `activate` / `deactivate` actions shared by every resource with a status. */
export function assertCanSetStatus(current: ActiveStatus, next: ActiveStatus): void {
  if (current === next) {
    throw new BusinessError(
      next === 'active' ? 'El registro ya está activo.' : 'El registro ya está inactivo.',
    );
  }
}

/** Case- and space-insensitive comparison used by every uniqueness rule. */
export const sameText = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();
