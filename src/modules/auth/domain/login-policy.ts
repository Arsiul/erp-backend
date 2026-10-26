import { BusinessError } from '../../../shared/domain/errors/domain-error';
import type { AuthUser } from './auth-user';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60_000;

/** Audit trail of failed logins (administracion / usuarios). */
export const LOGIN_FAILED_ACTION = 'Inicio de sesión fallido';
export const PASSWORD_CHANGED_ACTION = 'Cambió su contraseña';
/** Actor of a failed login whose email matches no user. */
export const UNKNOWN_ACTOR_NAME = 'Sin identificar';

/** One message for unknown email and wrong password, so emails cannot be probed. */
export const invalidCredentials = (): BusinessError =>
  new BusinessError('Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS');

export const accountLocked = (): BusinessError =>
  new BusinessError('Demasiados intentos. Vuelve a intentarlo en 15 minutos.', 'ACCOUNT_LOCKED');

/** Only shown after the password was verified. */
export const userInactive = (): BusinessError =>
  new BusinessError(
    'Tu usuario está desactivado. Pide acceso a un administrador.',
    'USER_INACTIVE',
  );

export const wrongCurrentPassword = (): BusinessError =>
  new BusinessError('La contraseña actual no es correcta.');

export const isLocked = (user: Pick<AuthUser, 'lockedUntil'>, now: Date): boolean =>
  user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();

/** The fifth consecutive failure locks the account. */
export const reachesLockout = (failedAttempts: number): boolean =>
  failedAttempts >= MAX_FAILED_ATTEMPTS;

export const lockedUntil = (now: Date): Date => new Date(now.getTime() + LOCK_DURATION_MS);
