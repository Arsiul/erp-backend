import { ForbiddenError } from '../errors/domain-error';
import type { ModuleId } from '../module-id';

/** none = the module is hidden; read = query only; write = create, edit and run actions. */
export type AccessLevel = 'none' | 'read' | 'write';

export const ACCESS_LEVELS = ['none', 'read', 'write'] as const satisfies readonly AccessLevel[];

export const LEVEL_RANK: Readonly<Record<AccessLevel, number>> = { none: 0, read: 1, write: 2 };

export type Permissions = Readonly<Record<ModuleId, AccessLevel>>;

export const isAccessLevel = (value: unknown): value is AccessLevel =>
  typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value);

export const hasAccess = (
  permissions: Permissions,
  module: ModuleId,
  level: AccessLevel,
): boolean => LEVEL_RANK[permissions[module]] >= LEVEL_RANK[level];

export const READ_ONLY_MESSAGE = 'Tu rol solo permite consultar este módulo.';
export const NO_ACCESS_MESSAGE = 'Tu rol no tiene acceso a este módulo.';

/** Same rule and messages as `sessionService.assertAccess` in the frontend. */
export function assertAccess(permissions: Permissions, module: ModuleId, level: AccessLevel): void {
  if (!hasAccess(permissions, module, level)) {
    throw new ForbiddenError(level === 'write' ? READ_ONLY_MESSAGE : NO_ACCESS_MESSAGE);
  }
}
