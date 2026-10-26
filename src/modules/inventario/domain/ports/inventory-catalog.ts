import type { Money } from '../../../../shared/domain/money/money';
import type { ActiveStatus } from '../../../../shared/domain/validation/field-rules';

export const INVENTORY_CATALOG = Symbol('InventoryCatalog');

export interface CatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
  readonly status: ActiveStatus;
}

export interface CatalogWarehouse {
  readonly id: string;
  readonly name: string;
  readonly status: ActiveStatus;
}

export interface StockLevel {
  readonly quantity: number;
  readonly unitCost: Money;
}

/** Read-only lookups of the masters and stock rows that inventory documents point to. */
export interface InventoryCatalog {
  findProduct(id: string): Promise<CatalogProduct | null>;
  findWarehouse(id: string): Promise<CatalogWarehouse | null>;
  findStock(productId: string, warehouseId: string): Promise<StockLevel | null>;
}
