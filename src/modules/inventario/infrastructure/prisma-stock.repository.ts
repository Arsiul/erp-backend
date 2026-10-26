import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { StockRecord } from '../domain/inventory';
import type { StockCriteria, StockRepository } from '../domain/ports/inventory.repositories';

const STOCK_FIELDS = {
  id: true,
  productId: true,
  warehouseId: true,
  quantity: true,
  minStock: true,
  unitCost: true,
  product: { select: { name: true, sku: true, unit: true, category: { select: { name: true } } } },
  warehouse: { select: { name: true } },
} as const satisfies Prisma.StockItemSelect;

type StockRow = Prisma.StockItemGetPayload<{ select: typeof STOCK_FIELDS }>;

const toRecord = (row: StockRow): StockRecord => ({
  id: row.id,
  productId: row.productId,
  productName: row.product.name,
  sku: row.product.sku,
  categoryName: row.product.category.name,
  unit: row.product.unit,
  warehouseId: row.warehouseId,
  warehouseName: row.warehouse.name,
  quantity: row.quantity,
  minStock: row.minStock,
  unitCost: moneyOf(row.unitCost),
});

@Injectable()
export class PrismaStockRepository implements StockRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: StockCriteria): Promise<ListResult<StockRecord>> {
    const where: Prisma.StockItemWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { product: { sku: contains(criteria.q) } },
              { product: { name: contains(criteria.q) } },
              { product: { category: { name: contains(criteria.q) } } },
              { warehouse: { name: contains(criteria.q) } },
            ],
          }),
      ...(criteria.productId === undefined ? {} : { productId: criteria.productId }),
      ...(criteria.warehouseId === undefined ? {} : { warehouseId: criteria.warehouseId }),
    };
    const total = await this.host.client.stockItem.count({ where });
    const rows = await this.host.client.stockItem.findMany({
      where,
      select: STOCK_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<StockRecord | null> {
    const row = await this.host.client.stockItem.findUnique({
      where: { id },
      select: STOCK_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async setMinStock(id: string, minStock: number): Promise<StockRecord> {
    const row = await this.host.client.stockItem.update({
      where: { id },
      data: { minStock },
      select: STOCK_FIELDS,
    });
    return toRecord(row);
  }
}
