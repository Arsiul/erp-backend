import { Global, Module } from '@nestjs/common';
import { RECEIVABLE_LEDGER } from '../../shared/domain/ports/receivable-ledger.port';
import { PrismaReceivableLedger } from './infrastructure/prisma-receivable-ledger';

/**
 * Global RECEIVABLE_LEDGER adapter used by tesoreria. It writes through the transaction host, so
 * a collection commits or rolls back with the cash movement that records it.
 */
@Global()
@Module({
  providers: [{ provide: RECEIVABLE_LEDGER, useClass: PrismaReceivableLedger }],
  exports: [RECEIVABLE_LEDGER],
})
export class ReceivableLedgerModule {}
