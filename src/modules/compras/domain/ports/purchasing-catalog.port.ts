import type { Money } from '../../../../shared/domain/money/money';
import type { ActiveStatus } from '../../../../shared/domain/validation/field-rules';

export const PURCHASING_CATALOG = Symbol('PurchasingCatalog');

export interface CatalogSupplier {
  readonly id: string;
  readonly name: string;
  readonly paymentDays: number;
  readonly status: ActiveStatus;
}

export interface CatalogWarehouse {
  readonly id: string;
  readonly name: string;
  readonly status: ActiveStatus;
}

export interface CatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly costPrice: Money;
  readonly status: ActiveStatus;
}

/** The masters and settings that purchase documents read, plus the cost update of a receipt. */
export interface PurchasingCatalog {
  findSupplier(id: string): Promise<CatalogSupplier | null>;
  findWarehouse(id: string): Promise<CatalogWarehouse | null>;
  /** The products that exist among `ids`; missing ids are simply absent. */
  findProducts(ids: readonly string[]): Promise<readonly CatalogProduct[]>;
  /** `settings.igvRate`, e.g. `0.18`. */
  igvRate(): Promise<number>;
  /** The last purchase price becomes the product cost (`products.cost_price`). */
  setCostPrice(productId: string, costPrice: Money): Promise<void>;
}
