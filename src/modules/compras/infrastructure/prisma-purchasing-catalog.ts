import { SETTINGS_ID } from '../../../shared/infrastructure/prisma/settings-row';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Money } from '../../../shared/domain/money/money';
import type {
  CatalogProduct,
  CatalogSupplier,
  CatalogWarehouse,
  PurchasingCatalog,
} from '../domain/ports/purchasing-catalog.port';
import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';

/**
 * Reads the masters and settings that purchasing snapshots into its documents, and keeps the
 * product cost price at the last received unit price.
 */
@Injectable()
export class PrismaPurchasingCatalog implements PurchasingCatalog {
  constructor(private readonly host: PrismaTransactionHost) {}

  findSupplier(id: string): Promise<CatalogSupplier | null> {
    return this.host.client.supplier.findUnique({
      where: { id },
      select: { id: true, name: true, paymentDays: true, status: true },
    });
  }

  findWarehouse(id: string): Promise<CatalogWarehouse | null> {
    return this.host.client.warehouse.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  }

  async findProducts(ids: readonly string[]): Promise<readonly CatalogProduct[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.host.client.product.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, sku: true, costPrice: true, status: true },
    });
    return rows.map((row) => ({ ...row, costPrice: moneyOf(row.costPrice) }));
  }

  async igvRate(): Promise<number> {
    const settings = await this.host.client.settings.findUnique({
      where: { id: SETTINGS_ID },
      select: { igvRate: true },
    });
    return settings === null ? 0 : Number(settings.igvRate);
  }

  async setCostPrice(productId: string, costPrice: Money): Promise<void> {
    await this.host.client.product.update({
      where: { id: productId },
      data: { costPrice: costPrice.toDecimal() },
    });
  }
}
