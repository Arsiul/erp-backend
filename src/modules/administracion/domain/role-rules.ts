import {
  ACCESS_LEVELS,
  type AccessLevel,
  type Permissions,
} from '../../../shared/domain/authorization/access-level';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { MODULE_IDS, type ModuleId } from '../../../shared/domain/module-id';
import { optionalText, pickEnum, requireText } from '../../../shared/domain/validation/field-rules';
import type { RoleRecord, RoleValues } from './role';

export interface RoleInput {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly permissions?: unknown;
}

export interface RoleLookups {
  /** Case-insensitive; `exceptId` skips the role being edited. */
  isNameTaken(name: string, exceptId?: string): Promise<boolean>;
}

/** Every module gets a level: a missing one is `none`, an unknown one is rejected. */
export function normalizePermissions(value: unknown): Permissions {
  const source = new Map<string, unknown>(
    typeof value === 'object' && value !== null ? Object.entries(value) : [],
  );
  const permissions = {} as Record<ModuleId, AccessLevel>;
  for (const module of MODULE_IDS) {
    permissions[module] = pickEnum(
      source.get(module),
      ACCESS_LEVELS,
      'El nivel de acceso no es válido.',
      'none',
    );
  }
  return permissions;
}

/** Same checks, order and messages as `roleValues` in the frontend mocks. */
export async function roleValues(
  input: RoleInput,
  lookups: RoleLookups,
  exceptId?: string,
): Promise<RoleValues> {
  const name = requireText(input.name, 'Escribe el nombre del rol.');
  if (await lookups.isNameTaken(name, exceptId)) {
    throw new BusinessError('Ya existe un rol con ese nombre.');
  }
  return {
    name,
    description: optionalText(input.description),
    permissions: normalizePermissions(input.permissions),
  };
}

export function assertRoleEditable(role: RoleRecord): void {
  if (role.system) {
    throw new BusinessError('Los roles del sistema no se modifican; crea uno nuevo.');
  }
}

export function assertRoleRemovable(role: RoleRecord, userCount: number): void {
  if (role.system) {
    throw new BusinessError('Los roles del sistema no se eliminan.');
  }
  if (userCount > 0) {
    throw new BusinessError('El rol tiene usuarios; asígnales otro rol antes de eliminarlo.');
  }
}
