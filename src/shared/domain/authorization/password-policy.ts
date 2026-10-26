import { BusinessError } from '../errors/domain-error';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Rule for every password chosen by a person (user creation, reset and self-service change). */
export function assertPasswordPolicy(plain: unknown): string {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw new BusinessError(
      `La contraseña debe tener al menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`,
    );
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    throw new BusinessError(
      `La contraseña no puede tener más de ${String(MAX_PASSWORD_LENGTH)} caracteres.`,
    );
  }
  return plain;
}
