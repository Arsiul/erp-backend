import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  activeStatus,
  EMAIL_PATTERN,
  requireText,
} from '../../../shared/domain/validation/field-rules';
import type { UserRecord, UserValues } from './user';

/** Untrusted user fields (create body, or the current record merged with a patch). */
export interface UserInput {
  readonly name?: unknown;
  readonly email?: unknown;
  readonly roleId?: unknown;
  readonly status?: unknown;
}

export interface UserLookups {
  /** Case-insensitive; `exceptId` skips the user being edited. */
  isEmailTaken(email: string, exceptId?: string): Promise<boolean>;
  findRoleName(roleId: string): Promise<string | null>;
}

export const SELF_ROLE_CHANGE = 'No puedes cambiar tu propio rol.';
export const SELF_DEACTIVATION = 'No puedes desactivar tu propio usuario.';
export const SELF_REMOVAL = 'No puedes eliminar tu propio usuario.';
export const USER_HAS_AUDITS =
  'El usuario tiene operaciones registradas; desactívalo en lugar de eliminarlo.';

/** Same checks, order and messages as `userValues` in the frontend mocks. */
export async function userValues(
  input: UserInput,
  lookups: UserLookups,
  exceptId?: string,
): Promise<UserValues> {
  const email = requireText(input.email, 'Escribe el correo.').toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new BusinessError('El correo no es válido.');
  }
  if (await lookups.isEmailTaken(email, exceptId)) {
    throw new BusinessError('Ya existe un usuario con ese correo.');
  }
  const roleId = typeof input.roleId === 'string' ? input.roleId : '';
  const roleName = roleId ? await lookups.findRoleName(roleId) : null;
  if (roleName === null) {
    throw new BusinessError('Selecciona el rol.');
  }
  return {
    name: requireText(input.name, 'Escribe el nombre.'),
    email,
    roleId,
    roleName,
    status: activeStatus(input.status),
  };
}

/** Nobody can change their own role or deactivate themselves. */
export function assertOwnUserUpdate(current: UserRecord, next: UserValues, actorId: string): void {
  if (current.id !== actorId) {
    return;
  }
  if (next.roleId !== current.roleId) {
    throw new BusinessError(SELF_ROLE_CHANGE);
  }
  if (next.status !== 'active') {
    throw new BusinessError(SELF_DEACTIVATION);
  }
}

export function assertCanDeactivate(userId: string, actorId: string): void {
  if (userId === actorId) {
    throw new BusinessError(SELF_DEACTIVATION);
  }
}

/** A user with audit entries is kept for traceability; it can only be deactivated. */
export function assertCanRemoveUser(userId: string, actorId: string, auditCount: number): void {
  if (userId === actorId) {
    throw new BusinessError(SELF_REMOVAL);
  }
  if (auditCount > 0) {
    throw new BusinessError(USER_HAS_AUDITS);
  }
}
