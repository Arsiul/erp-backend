import { LOCK_DURATION_MS } from '../domain/login-policy';
import { AuthController } from './auth.controller';

/** Metadata keys written by `@Throttle` (@nestjs/throttler) for the `default` throttler. */
const limitOf = (handler: object): Record<string, unknown> => {
  const meta = (key: string): unknown => Reflect.getMetadata(key, handler) as unknown;
  return {
    limit: meta('THROTTLER:LIMITdefault'),
    ttl: meta('THROTTLER:TTLdefault'),
    blockDuration: meta('THROTTLER:BLOCK_DURATIONdefault'),
  };
};

describe('AuthController throttling', () => {
  it.each(['signIn', 'password'] as const)(
    'limits %s to five tries a minute per IP and then blocks the IP',
    (method) => {
      const handler = AuthController.prototype[method] as object;
      expect(limitOf(handler)).toEqual({ limit: 5, ttl: 60_000, blockDuration: LOCK_DURATION_MS });
    },
  );
});
