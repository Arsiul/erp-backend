import { Injectable } from '@nestjs/common';
import type { AccessLevel, Permissions } from '../../../shared/domain/authorization/access-level';
import { MODULE_IDS, type ModuleId } from '../../../shared/domain/module-id';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../domain/auth-user';
import type { AuthUserRepository } from '../domain/ports/auth-user.repository';

const WITH_ROLE = { role: { include: { permissions: true } } } as const;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof WITH_ROLE }>;

/** Every module gets a level; a module without a row is `none`. */
export const toPermissions = (
  rows: readonly { module: ModuleId; access: AccessLevel }[],
): Permissions => {
  const byModule = new Map(rows.map((row) => [row.module, row.access]));
  return Object.fromEntries(
    MODULE_IDS.map((module) => [module, byModule.get(module) ?? 'none']),
  ) as Permissions;
};

const toAuthUser = (row: UserWithRole): AuthUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.passwordHash,
  status: row.status,
  failedAttempts: row.failedAttempts,
  lockedUntil: row.lockedUntil,
  lastAccessAt: row.lastAccessAt,
  role: {
    id: row.role.id,
    name: row.role.name,
    description: row.role.description,
    system: row.role.system,
    permissions: toPermissions(row.role.permissions),
  },
});

@Injectable()
export class PrismaAuthUserRepository implements AuthUserRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    const row = await this.host.client.user.findUnique({ where: { email }, include: WITH_ROLE });
    return row ? toAuthUser(row) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const row = await this.host.client.user.findUnique({ where: { id }, include: WITH_ROLE });
    return row ? toAuthUser(row) : null;
  }

  async registerFailure(userId: string): Promise<number> {
    const row = await this.host.client.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return row.failedAttempts;
  }

  async lock(userId: string, until: Date): Promise<void> {
    await this.host.client.user.update({
      where: { id: userId },
      data: { lockedUntil: until, failedAttempts: 0 },
    });
  }

  async registerSuccess(userId: string, at: Date): Promise<void> {
    await this.host.client.user.update({
      where: { id: userId },
      data: { lastAccessAt: at, failedAttempts: 0, lockedUntil: null },
    });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.host.client.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
