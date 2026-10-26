import {
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AccessLevel } from '../../domain/authorization/access-level';
import { actorOf, type AuthenticatedUser } from '../../domain/authorization/authenticated-user';
import {
  isResourceKey,
  RESOURCE_MODULE,
  type ResourceKey,
} from '../../domain/authorization/resources';
import { UnauthorizedError } from '../../domain/errors/domain-error';
import type { ModuleId } from '../../domain/module-id';
import type { AuditActor } from '../../domain/ports/audit-logger.port';
import type { AuthenticatedRequest } from './authenticated-request';

export const IS_PUBLIC_KEY = 'auth:public';
export const PERMISSION_KEY = 'auth:permission';

/** What PermissionGuard checks before the handler runs. */
export type PermissionRequirement =
  | { readonly kind: 'module'; readonly module: ModuleId; readonly level: AccessLevel }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'resource'; readonly param: string; readonly level?: AccessLevel };

/** No access token needed (login, refresh, logout, health). */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires `level` on the module of `target`. `target` is a ModuleId (`comercial`) or a
 * ResourceKey (`cotizaciones`), translated with the same RESOURCE_MODULE table as the frontend.
 */
export const RequirePermission = (
  target: ResourceKey | ModuleId,
  level: AccessLevel,
): CustomDecorator => {
  const module: ModuleId = isResourceKey(target) ? RESOURCE_MODULE[target] : target;
  return SetMetadata<string, PermissionRequirement>(PERMISSION_KEY, {
    kind: 'module',
    module,
    level,
  });
};

/**
 * For routes whose resource is a path parameter (`/:resource/unseen`). Unknown resources answer
 * 404; without `level`, GET/HEAD need `read` and every other method needs `write`.
 */
export const RequireResourcePermission = (
  param = 'resource',
  level?: AccessLevel,
): CustomDecorator =>
  SetMetadata<string, PermissionRequirement>(
    PERMISSION_KEY,
    level === undefined ? { kind: 'resource', param } : { kind: 'resource', param, level },
  );

/** Any signed-in user, whatever their permissions (session, own password, settings read). */
export const AllowAuthenticated = (): CustomDecorator =>
  SetMetadata<string, PermissionRequirement>(PERMISSION_KEY, { kind: 'authenticated' });

function requireUser(context: ExecutionContext): AuthenticatedUser {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

/** The user loaded by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  requireUser(context),
);

/** The audit actor (`{ userId, userName }`) of the current user, passed to the use case. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditActor => actorOf(requireUser(context)),
);
