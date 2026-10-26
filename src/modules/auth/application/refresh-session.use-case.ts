import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../shared/domain/errors/domain-error';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  AUTH_USER_REPOSITORY,
  type AuthUserRepository,
} from '../domain/ports/auth-user.repository';
import {
  REFRESH_SESSION_REPOSITORY,
  type RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';
import { REFRESH_TOKEN_FACTORY, type RefreshTokenFactory } from '../domain/ports/token.ports';
import { type ClientInfo, type IssuedSession, SessionIssuer } from './session-issuer';

/**
 * Rotates the refresh token: the presented one is revoked and a new one is issued in the same
 * family. A token presented twice (theft or replay) revokes the whole family. Revocations are
 * committed before the 401 is thrown.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(REFRESH_TOKEN_FACTORY) private readonly tokens: RefreshTokenFactory,
    @Inject(AUTH_USER_REPOSITORY) private readonly users: AuthUserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly issuer: SessionIssuer,
  ) {}

  async execute(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!refreshToken) {
      throw new UnauthorizedError();
    }
    const issued = await this.uow.run(async (): Promise<IssuedSession | null> => {
      const stored = await this.sessions.findByTokenHash(this.tokens.hash(refreshToken));
      if (!stored) {
        return null;
      }
      if (stored.revokedAt !== null || !(await this.sessions.revoke(stored.id))) {
        await this.sessions.revokeFamily(stored.familyId);
        return null;
      }
      if (stored.expiresAt.getTime() <= this.clock.now().getTime()) {
        return null;
      }
      const user = await this.users.findById(stored.userId);
      if (user?.status !== 'active') {
        await this.sessions.revokeFamily(stored.familyId);
        return null;
      }
      return this.issuer.issue(user, stored.familyId, client);
    });
    if (!issued) {
      throw new UnauthorizedError();
    }
    return issued;
  }
}
