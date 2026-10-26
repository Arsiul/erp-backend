import { Module } from '@nestjs/common';
import { MovementsUseCases } from './application/movements.use-cases';
import { BANK_ACCOUNT_CATALOG, MOVEMENT_REPOSITORY } from './domain/ports/treasury.ports';
import { PrismaBankAccountCatalog } from './infrastructure/prisma-bank-account-catalog';
import { PrismaMovementRepository } from './infrastructure/prisma-movement.repository';
import { MovementsController } from './presentation/movements.controller';

/**
 * Cash movements. Balances only move through the global BANK_LEDGER, and collections or payments
 * settle documents through RECEIVABLE_LEDGER and PAYABLE_LEDGER.
 */
@Module({
  controllers: [MovementsController],
  providers: [
    { provide: MOVEMENT_REPOSITORY, useClass: PrismaMovementRepository },
    { provide: BANK_ACCOUNT_CATALOG, useClass: PrismaBankAccountCatalog },
    MovementsUseCases,
  ],
})
export class TesoreriaModule {}
