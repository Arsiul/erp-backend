import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import type { PasswordHasher } from '../../domain/ports/password-hasher.port';

/** OWASP baseline for argon2id: 19 MiB, 2 iterations, 1 lane. */
export const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain);
    } catch {
      return false;
    }
  }
}
