import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  type ValidationError,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const;
export type SameSite = (typeof SAME_SITE_VALUES)[number];

export const STORAGE_DRIVERS = ['disk', 'database'] as const;
export type StorageDriverKind = (typeof STORAGE_DRIVERS)[number];
export const DEFAULT_STORAGE_DRIVER: StorageDriverKind = 'database';
export const DEFAULT_UPLOAD_DIR = './uploads';
/** Proxies in front of the app (Render's balancer); 2 when the frontend proxies `/api` too. */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

export const REQUIRED_TIME_ZONE = 'America/Lima';

const ORIGIN_PATTERN = /^https?:\/\/[^\s/,]+$/;

/**
 * Every variable is required unless marked optional: the application refuses to start if one is
 * missing or invalid. The optional INITIAL_ADMIN_* and COMPANY_* variables are read only by the
 * seed, which requires and validates them while there are no users or no settings row.
 */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
  })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Matches(/^\d+[smhd]$/, { message: 'JWT_ACCESS_TTL must look like 15m, 1h, 30s or 7d' })
  JWT_ACCESS_TTL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TTL_DAYS!: number;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @IsIn(['true', 'false'])
  COOKIE_SECURE!: 'true' | 'false';

  @IsIn(SAME_SITE_VALUES)
  COOKIE_SAMESITE!: SameSite;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT!: number;

  /** Hops trusted for `X-Forwarded-For`, so the login rate limit sees the client IP. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  TRUST_PROXY_HOPS?: number;

  @IsIn([REQUIRED_TIME_ZONE], { message: `TZ must be ${REQUIRED_TIME_ZONE}` })
  TZ!: typeof REQUIRED_TIME_ZONE;

  /** Where uploaded documents are kept: `database` (bytea, default) or `disk` (development only). */
  @IsOptional()
  @IsIn(STORAGE_DRIVERS)
  STORAGE_DRIVER?: StorageDriverKind;

  /** Folder for the `disk` driver; ignored by `database`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  UPLOAD_DIR?: string;

  @IsOptional()
  @IsString()
  INITIAL_ADMIN_NAME?: string;

  @IsOptional()
  @IsString()
  INITIAL_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  INITIAL_ADMIN_PASSWORD?: string;

  @IsOptional()
  @IsString()
  COMPANY_NAME?: string;

  @IsOptional()
  @IsString()
  COMPANY_RUC?: string;
}

export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const UNIT_SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** An access token is a bearer credential that cannot be revoked: it lives one hour at most. */
export const MAX_ACCESS_TTL_SECONDS = 3600;

/** `15m`, `1h`, `30s`, `7d` (format already enforced by the env schema) to seconds. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const unit = match?.[2] === undefined ? undefined : UNIT_SECONDS[match[2]];
  if (!match?.[1] || unit === undefined) {
    throw new Error(`Invalid token lifetime "${ttl}".`);
  }
  return Number(match[1]) * unit;
}

const describeError = (error: ValidationError): string =>
  `${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`;

function crossFieldProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  const origins = parseOrigins(env.CORS_ORIGIN);
  const invalid = origins.filter((origin) => !ORIGIN_PATTERN.test(origin));
  if (origins.length === 0 || invalid.length > 0) {
    problems.push(
      `CORS_ORIGIN: must be a comma-separated list of http(s) origins without path (invalid: ${invalid.join(', ') || '(empty)'})`,
    );
  }
  if (env.COOKIE_SAMESITE === 'none' && env.COOKIE_SECURE !== 'true') {
    problems.push('COOKIE_SAMESITE: "none" requires COOKIE_SECURE=true');
  }
  if (ttlToSeconds(env.JWT_ACCESS_TTL) > MAX_ACCESS_TTL_SECONDS) {
    problems.push('JWT_ACCESS_TTL: must be 1h or less');
  }
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'true') {
    problems.push('COOKIE_SECURE: must be true in production');
  }
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'disk') {
    problems.push('STORAGE_DRIVER: "disk" is not allowed in production (ephemeral filesystem)');
  }
  return problems;
}

/** Used by ConfigModule.forRoot({ validate }); throws with the full list of problems. */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw);
  const errors = validateSync(env, { forbidUnknownValues: true });
  const problems = errors.length > 0 ? errors.map(describeError) : crossFieldProblems(env);
  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
