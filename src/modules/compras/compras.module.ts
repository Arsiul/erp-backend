import { Module } from '@nestjs/common';
import { PayablesUseCases } from './application/payables.use-cases';
import { PurchaseOrdersUseCases } from './application/purchase-orders.use-cases';
import { ReceiptsUseCases } from './application/receipts.use-cases';
import { SupplierInvoicesUseCases } from './application/supplier-invoices.use-cases';
import { PURCHASING_CATALOG } from './domain/ports/purchasing-catalog.port';
import {
  PAYABLE_REPOSITORY,
  PURCHASE_ORDER_REPOSITORY,
  RECEIPT_REPOSITORY,
  SUPPLIER_INVOICE_REPOSITORY,
} from './domain/ports/purchasing.repositories';
import { PrismaPayableRepository } from './infrastructure/prisma-payable.repository';
import { PrismaPurchaseOrderRepository } from './infrastructure/prisma-purchase-order.repository';
import { PrismaPurchasingCatalog } from './infrastructure/prisma-purchasing-catalog';
import { PrismaReceiptRepository } from './infrastructure/prisma-receipt.repository';
import { PrismaSupplierInvoiceRepository } from './infrastructure/prisma-supplier-invoice.repository';
import { PayablesController } from './presentation/payables.controller';
import { PurchaseOrdersController } from './presentation/purchase-orders.controller';
import { ReceiptsController } from './presentation/receipts.controller';
import { SupplierInvoicesController } from './presentation/supplier-invoices.controller';

/**
 * Purchase orders, receipts, supplier invoices and payables. Stock enters through STOCK_LEDGER;
 * payments settle payables through the global PAYABLE_LEDGER (PayableLedgerModule).
 */
@Module({
  controllers: [
    PurchaseOrdersController,
    ReceiptsController,
    SupplierInvoicesController,
    PayablesController,
  ],
  providers: [
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: PrismaPurchaseOrderRepository },
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
    { provide: SUPPLIER_INVOICE_REPOSITORY, useClass: PrismaSupplierInvoiceRepository },
    { provide: PAYABLE_REPOSITORY, useClass: PrismaPayableRepository },
    { provide: PURCHASING_CATALOG, useClass: PrismaPurchasingCatalog },
    PurchaseOrdersUseCases,
    ReceiptsUseCases,
    SupplierInvoicesUseCases,
    PayablesUseCases,
  ],
  exports: [PurchaseOrdersUseCases],
})
export class ComprasModule {}
