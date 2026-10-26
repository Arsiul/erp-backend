import { Injectable } from '@nestjs/common';
import type { Permissions } from '../../../shared/domain/authorization/access-level';
import { MODULE_IDS } from '../../../shared/domain/module-id';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import { toPermissions } from '../../auth/infrastructure/prisma-auth-user.repository';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import type { RoleRepository } from '../domain/ports/role.repository';
import type { RoleRecord, RoleValues } from '../domain/role';
import {
  contains,
  dateRange,
  listWindow,
  translateUniqueViolation,
} from '../../../shared/infrastructure/prisma/prisma-list';

const WITH_PERMISSIONS = { permissions: true } as const satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof WITH_PERMISSIONS }>;

const NAME_TAKEN = 'Ya existe un rol con ese nombre.';

const toRecord = (row: RoleRow): RoleRecord => ({
  id: row.id,
  name: row.name,
  description: row.description,
  permissions: toPermissions(row.permissions),
  system: row.system,
});

const permissionRows = (permissions: Permissions): Prisma.RolePermissionCreateWithoutRoleInput[] =>
  MODULE_IDS.map((module) => ({ module, access: permissions[module] }));

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria): Promise<ListResult<RoleRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.RoleWhereInput = {
      ...(criteria.q === ''
        ? {}
        : { OR: [{ name: contains(criteria.q) }, { description: contains(criteria.q) }] }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.role.count({ where });
    const rows = await this.host.client.role.findMany({
      where,
      include: WITH_PERMISSIONS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<RoleRecord | null> {
    const row = await this.host.client.role.findUnique({
      where: { id },
      include: WITH_PERMISSIONS,
    });
    return row ? toRecord(row) : null;
  }

  async isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.role.count({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }),
      },
    });
    return count > 0;
  }

  create(values: RoleValues): Promise<RoleRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.role.create({
        data: {
          name: values.name,
          description: values.description,
          permissions: { create: permissionRows(values.permissions) },
        },
        include: WITH_PERMISSIONS,
      });
      return toRecord(row);
    }, NAME_TAKEN);
  }

  update(id: string, values: RoleValues): Promise<RoleRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.role.update({
        where: { id },
        data: {
          name: values.name,
          description: values.description,
          permissions: { deleteMany: {}, create: permissionRows(values.permissions) },
        },
        include: WITH_PERMISSIONS,
      });
      return toRecord(row);
    }, NAME_TAKEN);
  }

  async remove(id: string): Promise<void> {
    await this.host.client.role.delete({ where: { id } });
  }

  countUsers(id: string): Promise<number> {
    return this.host.client.user.count({ where: { roleId: id } });
  }
}
