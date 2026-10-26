import { Inject, Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../shared/infrastructure/prisma/prisma-transaction-host';
import { BOOTSTRAP_ENV, companyFrom, DEFAULT_SETTINGS, type EnvReader } from '../bootstrap-values';
import type { Seeder } from '../seeder';

/** Creates the settings singleton from COMPANY_* only when it is missing; edits are kept. */
@Injectable()
export class SettingsSeeder implements Seeder {
  readonly name = 'settings';

  constructor(
    private readonly host: PrismaTransactionHost,
    @Inject(BOOTSTRAP_ENV) private readonly env: EnvReader,
  ) {}

  async run(): Promise<void> {
    const client = this.host.client;
    if ((await client.settings.count()) > 0) {
      return;
    }
    await client.settings.create({
      data: { id: 1, ...companyFrom(this.env), ...DEFAULT_SETTINGS },
    });
  }
}
