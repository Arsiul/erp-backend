import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../../config/app-config';
import { ttlToSeconds } from '../../../config/env.schema';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
} from '../domain/ports/token.ports';

interface AccessPayload {
  readonly sub?: unknown;
}

/** HS256 JWT carrying only the user id (`sub`) and role id (`rid`). */
@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: AppConfig,
  ) {
    this.ttlSeconds = ttlToSeconds(config.jwt.accessTtl);
  }

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const token = await this.jwt.signAsync(
      { sub: claims.userId, rid: claims.roleId },
      { expiresIn: this.ttlSeconds },
    );
    return { token, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { algorithms: ['HS256'] });
      return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
