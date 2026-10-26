import { Module } from '@nestjs/common';
import { AdjustmentsUseCases } from './application/adjustments.use-cases';
import { KardexQueries } from './application/kardex.queries';
import { StockUseCases } from './application/stock.use-cases';
import { TransfersUseCases } from './application/transfers.use-cases';
import { INVENTORY_CATALOG } from './domain/ports/inventory-catalog';
import {
  ADJUSTMENT_REPOSITORY,
  KARDEX_REPOSITORY,
  STOCK_REPOSITORY,
  TRANSFER_REPOSITORY,
} from './domain/ports/inventory.repositories';
import { PrismaAdjustmentRepository } from './infrastructure/prisma-adjustment.repository';
import { PrismaInventoryCatalog } from './infrastructure/prisma-inventory-catalog';
import { PrismaKardexRepository } from './infrastructure/prisma-kardex.repository';
import { PrismaStockRepository } from './infrastructure/prisma-stock.repository';
import { PrismaTransferRepository } from './infrastructure/prisma-transfer.repository';
import { AdjustmentsController } from './presentation/adjustments.controller';
import { KardexController } from './presentation/kardex.controller';
import { StockController } from './presentation/stock.controller';
import { TransfersController } from './presentation/transfers.controller';

/** Stock, kardex, adjustments and transfers. Stock only moves through the global STOCK_LEDGER. */
@Module({
  controllers: [StockController, KardexController, AdjustmentsController, TransfersController],
  providers: [
    { provide: STOCK_REPOSITORY, useClass: PrismaStockRepository },
    { provide: KARDEX_REPOSITORY, useClass: PrismaKardexRepository },
    { provide: ADJUSTMENT_REPOSITORY, useClass: PrismaAdjustmentRepository },
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    { provide: INVENTORY_CATALOG, useClass: PrismaInventoryCatalog },
    StockUseCases,
    KardexQueries,
    AdjustmentsUseCases,
    TransfersUseCases,
  ],
})
export class InventarioModule {}
