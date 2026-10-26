/**
 * Fictitious defaults for e2e runs against the `db-test` service of docker-compose.yml.
 * Any variable already present in the environment wins.
 */
const E2E_DEFAULTS: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  TZ: 'America/Lima',
  DATABASE_URL: 'postgresql://erp_test:erp_test_password@localhost:5434/erp_test?schema=public',
  JWT_ACCESS_SECRET: 'e2e-only-secret-not-used-anywhere-else',
  JWT_ACCESS_TTL: '15m',
  REFRESH_TTL_DAYS: '7',
  CORS_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
  THROTTLE_TTL_SECONDS: '60',
  THROTTLE_LIMIT: '1000',
};

for (const [key, value] of Object.entries(E2E_DEFAULTS)) {
  process.env[key] ??= value;
}
