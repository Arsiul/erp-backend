import { parseOrigins, ttlToSeconds, validateEnv } from './env.schema';

const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  TZ: 'America/Lima',
  DATABASE_URL: 'postgresql://user:pass@localhost:5434/erp_test',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  REFRESH_TTL_DAYS: '7',
  CORS_ORIGIN: 'http://localhost:5173, https://erp.example.com',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
  THROTTLE_TTL_SECONDS: '60',
  THROTTLE_LIMIT: '100',
};

const withEnv = (overrides: Record<string, string | undefined>): Record<string, unknown> => ({
  ...VALID_ENV,
  ...overrides,
});

describe('validateEnv', () => {
  it('accepts a complete environment and converts numbers', () => {
    const env = validateEnv(VALID_ENV);
    expect(env.PORT).toBe(3000);
    expect(env.REFRESH_TTL_DAYS).toBe(7);
    expect(env.THROTTLE_LIMIT).toBe(100);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
  });

  it.each(Object.keys(VALID_ENV))('refuses to start when %s is missing', (key) => {
    expect(() => validateEnv(withEnv({ [key]: undefined }))).toThrow(
      new RegExp(`Invalid environment configuration:[\\s\\S]*- ${key}:`),
    );
  });

  it('lists every invalid variable at once', () => {
    let message = '';
    try {
      validateEnv(withEnv({ PORT: '0', NODE_ENV: 'staging' }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('- PORT:');
    expect(message).toContain('- NODE_ENV:');
  });

  it.each([
    ['DATABASE_URL', 'mysql://localhost/db', 'postgres:// or postgresql://'],
    ['JWT_ACCESS_SECRET', 'short', 'JWT_ACCESS_SECRET'],
    ['JWT_ACCESS_TTL', '15 minutes', 'JWT_ACCESS_TTL must look like'],
    ['TZ', 'UTC', 'TZ must be America/Lima'],
    ['COOKIE_SAMESITE', 'relaxed', 'COOKIE_SAMESITE'],
    ['COOKIE_SECURE', 'yes', 'COOKIE_SECURE'],
    ['TRUST_PROXY_HOPS', '4', 'TRUST_PROXY_HOPS'],
  ])('rejects an invalid %s', (key, value, expected) => {
    expect(() => validateEnv(withEnv({ [key]: value }))).toThrow(expected);
  });

  it.each([' , ', 'localhost:5173', 'http://localhost:5173/app'])(
    'rejects CORS_ORIGIN %p',
    (value) => {
      expect(() => validateEnv(withEnv({ CORS_ORIGIN: value }))).toThrow('CORS_ORIGIN: must be');
    },
  );

  it('requires secure cookies when SameSite is none', () => {
    expect(() => validateEnv(withEnv({ COOKIE_SAMESITE: 'none' }))).toThrow(
      'COOKIE_SAMESITE: "none" requires COOKIE_SECURE=true',
    );
    expect(
      validateEnv(withEnv({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' })).COOKIE_SAMESITE,
    ).toBe('none');
  });
});

describe('access token lifetime and production cookies', () => {
  it.each(['1h', '60m', '3600s', '15m'])('accepts JWT_ACCESS_TTL %p', (value) => {
    expect(validateEnv(withEnv({ JWT_ACCESS_TTL: value })).JWT_ACCESS_TTL).toBe(value);
  });

  it.each(['2h', '61m', '3601s', '1d'])('rejects JWT_ACCESS_TTL %p', (value) => {
    expect(() => validateEnv(withEnv({ JWT_ACCESS_TTL: value }))).toThrow(
      'JWT_ACCESS_TTL: must be 1h or less',
    );
  });

  it('requires secure cookies in production', () => {
    expect(() => validateEnv(withEnv({ NODE_ENV: 'production' }))).toThrow(
      'COOKIE_SECURE: must be true in production',
    );
    expect(
      validateEnv(withEnv({ NODE_ENV: 'production', COOKIE_SECURE: 'true' })).COOKIE_SECURE,
    ).toBe('true');
  });

  it('converts a lifetime to seconds and rejects a malformed one', () => {
    expect(ttlToSeconds('7d')).toBe(604_800);
    expect(() => ttlToSeconds('15')).toThrow('Invalid token lifetime');
  });
});

describe('parseOrigins', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseOrigins(' http://a.test ,, https://b.test ')).toEqual([
      'http://a.test',
      'https://b.test',
    ]);
  });
});
