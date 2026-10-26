import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RefreshTokenFactory } from '../domain/ports/token.ports';

/** 256 random bits; only the SHA-256 is stored, so a database leak does not expose live tokens. */
@Injectable()
export class CryptoRefreshTokenFactory implements RefreshTokenFactory {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
