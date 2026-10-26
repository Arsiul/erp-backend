import { Global, Module } from '@nestjs/common';
import { PAYABLE_LEDGER } from '../../shared/domain/ports/payable-ledger.port';
import { PrismaPayableLedger } from './infrastructure/prisma-payable-ledger';

/**
 * Global PAYABLE_LEDGER adapter used by tesoreria. It writes through the transaction host, so a
 * payment and its effect on the payable commit or roll back together.
 */
@Global()
@Module({
  providers: [{ provide: PAYABLE_LEDGER, useClass: PrismaPayableLedger }],
  exports: [PAYABLE_LEDGER],
})
export class PayableLedgerModule {}
