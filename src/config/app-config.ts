import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_STORAGE_DRIVER,
  DEFAULT_TRUST_PROXY_HOPS,
  DEFAULT_UPLOAD_DIR,
  parseOrigins,
  type EnvironmentVariables,
  type NodeEnv,
  type SameSite,
  type StorageDriverKind,
} from './env.schema';

export interface CookieConfig {
  readonly secure: boolean;
  readonly sameSite: SameSite;
}

export interface JwtConfig {
  readonly accessSecret: string;
  readonly accessTtl: string;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

/** Where document files live: `disk` keeps them under `uploadDir` (development only). */
export interface StorageConfig {
  readonly driver: StorageDriverKind;
  readonly uploadDir: string;
}

/** Typed, read-only view of the validated environment. Inject this instead of ConfigService. */
@Injectable()
export class AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwt: JwtConfig;
  readonly refreshTtlDays: number;
  readonly corsOrigins: readonly string[];
  readonly cookie: CookieConfig;
  readonly throttle: ThrottleConfig;
  readonly trustProxyHops: number;
  readonly storage: StorageConfig;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const get = <K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] =>
      config.get(key, { infer: true });

    this.nodeEnv = get('NODE_ENV');
    this.isProduction = this.nodeEnv === 'production';
    this.port = get('PORT');
    this.databaseUrl = get('DATABASE_URL');
    this.jwt = { accessSecret: get('JWT_ACCESS_SECRET'), accessTtl: get('JWT_ACCESS_TTL') };
    this.refreshTtlDays = get('REFRESH_TTL_DAYS');
    this.corsOrigins = parseOrigins(get('CORS_ORIGIN'));
    this.cookie = { secure: get('COOKIE_SECURE') === 'true', sameSite: get('COOKIE_SAMESITE') };
    this.throttle = { ttlMs: get('THROTTLE_TTL_SECONDS') * 1000, limit: get('THROTTLE_LIMIT') };
    this.trustProxyHops = get('TRUST_PROXY_HOPS') ?? DEFAULT_TRUST_PROXY_HOPS;
    this.storage = {
      driver: get('STORAGE_DRIVER') ?? DEFAULT_STORAGE_DRIVER,
      uploadDir: get('UPLOAD_DIR') ?? DEFAULT_UPLOAD_DIR,
    };
  }
}
