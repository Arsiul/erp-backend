import { Injectable } from '@nestjs/common';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import type { UserCriteria, UserRepository } from '../domain/ports/user.repository';
import type { UserRecord, UserValues } from '../domain/user';
import {
  contains,
  dateRange,
  listWindow,
  translateUniqueViolation,
} from '../../../shared/infrastructure/prisma/prisma-list';

/** Never selects the password hash. */
const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  status: true,
  lastAccessAt: true,
  role: { select: { name: true } },
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_FIELDS }>;

const EMAIL_TAKEN = 'Ya existe un usuario con ese correo.';

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  roleId: row.roleId,
  roleName: row.role.name,
  status: row.status,
  lastAccessAt: row.lastAccessAt,
});

const editable = (values: UserValues): Prisma.UserUncheckedUpdateInput => ({
  name: values.name,
  email: values.email,
  roleId: values.roleId,
  status: values.status,
});

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: UserCriteria): Promise<ListResult<UserRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.UserWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { name: contains(criteria.q) },
              { email: contains(criteria.q) },
              { role: { name: contains(criteria.q) } },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.roleId === undefined ? {} : { roleId: criteria.roleId }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.user.count({ where });
    const rows = await this.host.client.user.findMany({
      where,
      select: USER_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.host.client.user.findUnique({ where: { id }, select: USER_FIELDS });
    return row ? toRecord(row) : null;
  }

  async isEmailTaken(email: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.user.count({
      where: {
        email: email.toLowerCase(),
        ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }),
      },
    });
    return count > 0;
  }

  async findRoleName(roleId: string): Promise<string | null> {
    const role = await this.host.client.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name ?? null;
  }

  create(values: UserValues, passwordHash: string): Promise<UserRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.user.create({
        data: {
          name: values.name,
          email: values.email,
          roleId: values.roleId,
          status: values.status,
          passwordHash,
        },
        select: USER_FIELDS,
      });
      return toRecord(row);
    }, EMAIL_TAKEN);
  }

  update(id: string, values: UserValues): Promise<UserRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.user.update({
        where: { id },
        data: editable(values),
        select: USER_FIELDS,
      });
      return toRecord(row);
    }, EMAIL_TAKEN);
  }

  async setStatus(id: string, status: ActiveStatus): Promise<UserRecord> {
    const row = await this.host.client.user.update({
      where: { id },
      data: { status },
      select: USER_FIELDS,
    });
    return toRecord(row);
  }

  /** A new password also clears the failed-login counter and any lockout. */
  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.host.client.user.update({
      where: { id },
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    });
  }

  async remove(id: string): Promise<void> {
    await this.host.client.user.delete({ where: { id } });
  }

  countAudits(id: string): Promise<number> {
    return this.host.client.auditLog.count({ where: { userId: id } });
  }
}
