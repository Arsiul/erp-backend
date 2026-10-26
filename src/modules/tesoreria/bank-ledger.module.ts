import { Global, Module } from '@nestjs/common';
import { BANK_LEDGER } from '../../shared/domain/ports/bank-ledger.port';
import { PrismaBankLedger } from './infrastructure/prisma-bank-ledger';

/** Global BANK_LEDGER adapter used by comercial and compras. */
@Global()
@Module({
  providers: [{ provide: BANK_LEDGER, useClass: PrismaBankLedger }],
  exports: [BANK_LEDGER],
})
export class BankLedgerModule {}
