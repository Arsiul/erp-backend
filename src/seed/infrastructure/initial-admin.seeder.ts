import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../shared/domain/ports/password-hasher.port';
import { PrismaTransactionHost } from '../../shared/infrastructure/prisma/prisma-transaction-host';
import { BOOTSTRAP_ENV, type EnvReader, initialAdminFrom } from '../bootstrap-values';
import { ADMIN_ROLE_ID } from '../roles.data';
import type { Seeder } from '../seeder';

/**
 * Creates the first administrator from INITIAL_ADMIN_* only while there are no users at all.
 * Once any user exists it does nothing, so passwords are never overwritten.
 */
@Injectable()
export class InitialAdminSeeder implements Seeder {
  readonly name = 'initial-admin';

  constructor(
    private readonly host: PrismaTransactionHost,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(BOOTSTRAP_ENV) private readonly env: EnvReader,
  ) {}

  async run(): Promise<void> {
    const client = this.host.client;
    if ((await client.user.count()) > 0) {
      return;
    }
    const admin = initialAdminFrom(this.env);
    await client.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        roleId: ADMIN_ROLE_ID,
        passwordHash: await this.hasher.hash(admin.password),
      },
    });
  }
}
