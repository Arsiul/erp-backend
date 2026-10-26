import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AppConfig } from '../../src/config/app-config';
import { SeedModule } from '../../src/seed/seed.module';
import { SeedRunner } from '../../src/seed/seed.runner';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../src/shared/domain/ports/password-hasher.port';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

export const API = '/api/v1';

/** Fictitious bootstrap values: the seed creates this administrator and this company. */
export const BOOTSTRAP = {
  INITIAL_ADMIN_NAME: 'Administrador E2E',
  INITIAL_ADMIN_EMAIL: 'admin@e2e.test',
  INITIAL_ADMIN_PASSWORD: 'clave-admin-e2e-2026',
  COMPANY_NAME: 'Empresa E2E S.A.C.',
  COMPANY_RUC: '20123456789',
} as const;

export type FixtureRole =
  'role-admin' | 'role-ventas' | 'role-compras' | 'role-tesoreria' | 'role-consulta';

export interface Credentials {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface SignedIn {
  readonly token: string;
  /** `erp_rt=<token>`, ready for a `Cookie` header. */
  readonly cookie: string;
}

export interface FixtureOptions {
  readonly status?: 'active' | 'inactive';
}

/** The response body, typed by the caller (supertest types it as `any`). */
export function bodyOf<T>(response: { readonly body: T }): T {
  return response.body;
}

/** `erp_rt=<token>` from a response, or `undefined` when it did not set the cookie. */
export function refreshCookieOf(response: Response): string | undefined {
  const header: unknown = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.map((cookie) => cookie.split(';')[0] ?? '').find((c) => c.startsWith('erp_rt='));
}

let migrated = false;
let ipCounter = 0;

/** A distinct client address per call, so the per-IP login throttle never interferes. */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${String(Math.floor(ipCounter / 250) % 250)}.${String(ipCounter % 250)}.7`;
}

function migrate(): void {
  if (!migrated) {
    execSync('pnpm exec prisma migrate deploy', { env: process.env, stdio: 'pipe' });
    migrated = true;
  }
}

/** Runs the real seed (roles, settings, initial administrator) in its own application context. */
export async function runSeed(
  values: Partial<Record<keyof typeof BOOTSTRAP, string>> = {},
): Promise<void> {
  Object.assign(process.env, BOOTSTRAP, values);
  const context = await NestFactory.createApplicationContext(SeedModule, { logger: false });
  try {
    await context.get(SeedRunner).run();
  } finally {
    await context.close();
  }
}

/**
 * The application against db-test, starting from an empty, migrated and seeded database. Every
 * user besides the seeded administrator is created by {@link E2eContext.createUser}.
 */
export class E2eContext {
  private constructor(
    readonly app: NestExpressApplication,
    readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  static async start(): Promise<E2eContext> {
    migrate();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, app.get(AppConfig));
    await app.init();
    const context = new E2eContext(app, app.get(PrismaService), app.get(PASSWORD_HASHER));
    await context.reset();
    return context;
  }

  get http(): ReturnType<typeof request> {
    return request(this.app.getHttpServer());
  }

  get admin(): Omit<Credentials, 'id'> {
    return {
      name: BOOTSTRAP.INITIAL_ADMIN_NAME,
      email: BOOTSTRAP.INITIAL_ADMIN_EMAIL,
      password: BOOTSTRAP.INITIAL_ADMIN_PASSWORD,
    };
  }

  /** Empties every table except the migration history and seeds again. */
  async reset(): Promise<void> {
    const tables = await this.prisma.$queryRawUnsafe<{ tablename: string }[]>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    const names = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
    await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    await runSeed();
  }

  /** A fixture user with the given role and a unique email. */
  async createUser(roleId: FixtureRole, options: FixtureOptions = {}): Promise<Credentials> {
    const suffix = randomUUID().slice(0, 8);
    const password = `clave-${suffix}-e2e`;
    const user = await this.prisma.user.create({
      data: {
        name: `Usuario ${roleId.replace('role-', '')} ${suffix}`,
        email: `${roleId.replace('role-', '')}-${suffix}@e2e.test`,
        roleId,
        status: options.status ?? 'active',
        passwordHash: await this.hasher.hash(password),
      },
    });
    return { id: user.id, name: user.name, email: user.email, password };
  }

  login(email: string, password: string): request.Test {
    return this.http
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });
  }

  async signIn(user: Pick<Credentials, 'email' | 'password'>): Promise<SignedIn> {
    const response = await this.login(user.email, user.password).expect(200);
    const cookie = refreshCookieOf(response);
    if (cookie === undefined) {
      throw new Error('The login did not set the refresh cookie.');
    }
    return { token: bodyOf<{ accessToken: string }>(response).accessToken, cookie };
  }

  /** Signs in a new fixture user of the role and returns its bearer token. */
  async tokenFor(roleId: FixtureRole): Promise<string> {
    return (await this.signIn(await this.createUser(roleId))).token;
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}
