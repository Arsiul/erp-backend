import type { ConfigService } from '@nestjs/config';
import { AppConfig } from './app-config';
import type { EnvironmentVariables } from './env.schema';

const ENV = {
  NODE_ENV: 'production',
  PORT: 8080,
  TZ: 'America/Lima',
  DATABASE_URL: 'postgresql://user:pass@db:5432/erp',
  JWT_ACCESS_SECRET: 's'.repeat(40),
  JWT_ACCESS_TTL: '15m',
  REFRESH_TTL_DAYS: 7,
  CORS_ORIGIN: 'https://erp.example.com,https://admin.example.com',
  COOKIE_SECURE: 'true',
  COOKIE_SAMESITE: 'strict',
  THROTTLE_TTL_SECONDS: 60,
  THROTTLE_LIMIT: 100,
} satisfies EnvironmentVariables;

const configFor = (env: EnvironmentVariables): ConfigService<EnvironmentVariables, true> =>
  ({
    get: (key: keyof EnvironmentVariables) => env[key],
  }) as unknown as ConfigService<EnvironmentVariables, true>;

describe('AppConfig', () => {
  it('exposes a typed view of the environment', () => {
    const config = new AppConfig(configFor(ENV));
    expect(config).toMatchObject({
      nodeEnv: 'production',
      isProduction: true,
      port: 8080,
      databaseUrl: ENV.DATABASE_URL,
      jwt: { accessSecret: ENV.JWT_ACCESS_SECRET, accessTtl: '15m' },
      refreshTtlDays: 7,
      corsOrigins: ['https://erp.example.com', 'https://admin.example.com'],
      cookie: { secure: true, sameSite: 'strict' },
      throttle: { ttlMs: 60_000, limit: 100 },
      trustProxyHops: 1,
    });
  });

  it('trusts the configured proxy hops', () => {
    expect(new AppConfig(configFor({ ...ENV, TRUST_PROXY_HOPS: 2 })).trustProxyHops).toBe(2);
  });

  it('is not production outside NODE_ENV=production', () => {
    const config = new AppConfig(
      configFor({ ...ENV, NODE_ENV: 'development', COOKIE_SECURE: 'false' }),
    );
    expect(config.isProduction).toBe(false);
    expect(config.cookie.secure).toBe(false);
  });

  it('stores documents in the database unless disk is configured', () => {
    expect(new AppConfig(configFor(ENV)).storage).toEqual({
      driver: 'database',
      uploadDir: './uploads',
    });
    const disk = new AppConfig(
      configFor({
        ...ENV,
        NODE_ENV: 'development',
        STORAGE_DRIVER: 'disk',
        UPLOAD_DIR: '/tmp/erp',
      }),
    );
    expect(disk.storage).toEqual({ driver: 'disk', uploadDir: '/tmp/erp' });
  });
});
