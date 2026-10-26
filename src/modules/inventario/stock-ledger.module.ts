import { Global, Module } from '@nestjs/common';
import { STOCK_LEDGER } from '../../shared/domain/ports/stock-ledger.port';
import { PrismaStockLedger } from './infrastructure/prisma-stock-ledger';

/** Global STOCK_LEDGER adapter used by maestros, comercial and compras. */
@Global()
@Module({
  providers: [{ provide: STOCK_LEDGER, useClass: PrismaStockLedger }],
  exports: [STOCK_LEDGER],
})
export class StockLedgerModule {}
