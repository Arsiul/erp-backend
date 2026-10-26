import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../shared/presentation/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../../shared/presentation/auth/authenticated-request';
import { AuthenticateRequestUseCase } from '../application/authenticate-request.use-case';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless it is marked
 * `@Public()`. Sets `request.user`, which PermissionGuard and `@CurrentUser()` read.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticate: AuthenticateRequestUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    request.user = await this.authenticate.execute(token);
    return true;
  }
}
