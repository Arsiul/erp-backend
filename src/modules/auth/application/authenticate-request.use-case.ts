import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { UnauthorizedError } from '../../../shared/domain/errors/domain-error';
import { toAuthenticatedUser } from '../domain/auth-user';
import {
  AUTH_USER_REPOSITORY,
  type AuthUserRepository,
} from '../domain/ports/auth-user.repository';
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from '../domain/ports/token.ports';

/**
 * Resolves the bearer token to the current user. The user and the role matrix are read on every
 * request, so a deactivation or a permission change applies at once, without waiting for the
 * token to expire.
 */
@Injectable()
export class AuthenticateRequestUseCase {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly tokens: AccessTokenService,
    @Inject(AUTH_USER_REPOSITORY) private readonly users: AuthUserRepository,
  ) {}

  async execute(accessToken: string | undefined): Promise<AuthenticatedUser> {
    const userId = accessToken ? await this.tokens.verify(accessToken) : null;
    const user = userId === null ? null : await this.users.findById(userId);
    if (user?.status !== 'active') {
      throw new UnauthorizedError();
    }
    return toAuthenticatedUser(user);
  }
}
