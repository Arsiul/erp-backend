import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  CatalogProduct,
  CatalogWarehouse,
  InventoryCatalog,
  StockLevel,
} from '../domain/ports/inventory-catalog';

@Injectable()
export class PrismaInventoryCatalog implements InventoryCatalog {
  constructor(private readonly host: PrismaTransactionHost) {}

  findProduct(id: string): Promise<CatalogProduct | null> {
    return this.host.client.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true, unit: true, status: true },
    });
  }

  findWarehouse(id: string): Promise<CatalogWarehouse | null> {
    return this.host.client.warehouse.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  }

  async findStock(productId: string, warehouseId: string): Promise<StockLevel | null> {
    const row = await this.host.client.stockItem.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { quantity: true, unitCost: true },
    });
    return row ? { quantity: row.quantity, unitCost: moneyOf(row.unitCost) } : null;
  }
}
