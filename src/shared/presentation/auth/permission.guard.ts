import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AccessLevel, assertAccess } from '../../domain/authorization/access-level';
import { isResourceKey, RESOURCE_MODULE } from '../../domain/authorization/resources';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors/domain-error';
import { IS_PUBLIC_KEY, PERMISSION_KEY, type PermissionRequirement } from './auth.decorators';
import type { AuthenticatedRequest } from './authenticated-request';

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Global guard that runs after JwtAuthGuard. It fails closed: a non-public handler without
 * `@RequirePermission`, `@RequireResourcePermission` or `@AllowAuthenticated` is rejected (403).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      PERMISSION_KEY,
      targets,
    );
    if (!requirement) {
      throw new ForbiddenError();
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedError();
    }
    switch (requirement.kind) {
      case 'authenticated':
        return true;
      case 'module':
        assertAccess(user.permissions, requirement.module, requirement.level);
        return true;
      case 'resource': {
        const resource = request.params[requirement.param];
        if (typeof resource !== 'string' || !isResourceKey(resource)) {
          throw new NotFoundException();
        }
        const level: AccessLevel =
          requirement.level ?? (READ_METHODS.has(request.method) ? 'read' : 'write');
        assertAccess(user.permissions, RESOURCE_MODULE[resource], level);
        return true;
      }
    }
  }
}
