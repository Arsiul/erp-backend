import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  REFRESH_SESSION_REPOSITORY,
  type RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';
import { REFRESH_TOKEN_FACTORY, type RefreshTokenFactory } from '../domain/ports/token.ports';

/** Ends the login behind the refresh cookie (its whole family). Idempotent. */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(REFRESH_TOKEN_FACTORY) private readonly tokens: RefreshTokenFactory,
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.uow.run(async () => {
      const stored = await this.sessions.findByTokenHash(this.tokens.hash(refreshToken));
      if (stored) {
        await this.sessions.revokeFamily(stored.familyId);
      }
    });
  }
}
