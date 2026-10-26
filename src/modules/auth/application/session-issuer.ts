import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/domain/ports/id-generator.port';
import { type AuthUser, type SessionView, toSessionView } from '../domain/auth-user';
import {
  REFRESH_SESSION_REPOSITORY,
  type RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';
import {
  ACCESS_TOKEN_SERVICE,
  type AccessTokenService,
  REFRESH_TOKEN_FACTORY,
  type RefreshTokenFactory,
} from '../domain/ports/token.ports';

export const AUTH_OPTIONS = Symbol('AuthOptions');

export interface AuthOptions {
  readonly refreshTtlMs: number;
}

/** Where a login or refresh comes from; stored with the refresh session. */
export interface ClientInfo {
  readonly ip: string;
  readonly userAgent: string;
}

export interface IssuedSession {
  readonly accessToken: string;
  /** Access token lifetime in seconds. */
  readonly expiresIn: number;
  /** Goes only to the httpOnly cookie, never to the response body. */
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly session: SessionView;
}

/** Signs the access token and stores a new refresh session (in the current UnitOfWork). */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_FACTORY) private readonly refreshTokens: RefreshTokenFactory,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
  ) {}

  /** `familyId` null starts a new family (login); a refresh keeps the family it rotates. */
  async issue(user: AuthUser, familyId: string | null, client: ClientInfo): Promise<IssuedSession> {
    const refreshToken = this.refreshTokens.generate();
    const refreshExpiresAt = new Date(this.clock.now().getTime() + this.options.refreshTtlMs);
    await this.sessions.create({
      id: this.ids.next(),
      userId: user.id,
      tokenHash: this.refreshTokens.hash(refreshToken),
      familyId: familyId ?? this.ids.next(),
      expiresAt: refreshExpiresAt,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const access = await this.accessTokens.issue({ userId: user.id, roleId: user.role.id });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      refreshExpiresAt,
      session: toSessionView(user),
    };
  }
}
