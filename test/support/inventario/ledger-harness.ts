import { execSync } from 'node:child_process';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../src/config/app-config.module';
import { BankLedgerModule } from '../../../src/modules/tesoreria/bank-ledger.module';
import { StockLedgerModule } from '../../../src/modules/inventario/stock-ledger.module';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../src/shared/domain/ports/unit-of-work.port';
import { PrismaService } from '../../../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../../../src/shared/shared.module';

/**
 * Only the shared kernel and the ledger modules, so the adapter suites do not depend on the
 * HTTP modules of the other agents.
 */
export class LedgerHarness {
  private constructor(
    readonly context: INestApplicationContext,
    readonly prisma: PrismaService,
    readonly uow: UnitOfWork,
  ) {}

  static async start(): Promise<LedgerHarness> {
    execSync('pnpm exec prisma migrate deploy', { env: process.env, stdio: 'pipe' });
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, SharedModule, StockLedgerModule, BankLedgerModule],
    }).compile();
    const context = await moduleRef.init();
    return new LedgerHarness(context, context.get(PrismaService), context.get(UNIT_OF_WORK));
  }

  get(token: symbol): unknown {
    return this.context.get(token);
  }

  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE kardex_entries, stock_items, products, categories, warehouses, bank_accounts RESTART IDENTITY CASCADE',
    );
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}
