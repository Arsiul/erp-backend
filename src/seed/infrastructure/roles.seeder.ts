import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../shared/infrastructure/prisma/prisma-transaction-host';
import { BASE_ROLES, permissionMatrix } from '../roles.data';
import type { Seeder } from '../seeder';

/** Creates the system roles and their permission matrix; existing rows are kept. */
@Injectable()
export class RolesSeeder implements Seeder {
  readonly name = 'roles';

  constructor(private readonly host: PrismaTransactionHost) {}

  async run(): Promise<void> {
    const client = this.host.client;
    await client.role.createMany({
      data: BASE_ROLES.map(({ id, name, description, system }) => ({
        id,
        name,
        description,
        system,
      })),
      skipDuplicates: true,
    });
    await client.rolePermission.createMany({
      data: BASE_ROLES.flatMap((role) =>
        permissionMatrix(role).map(({ module, access }) => ({ roleId: role.id, module, access })),
      ),
      skipDuplicates: true,
    });
  }
}
