import type { Money } from '../money/money';

export const STOCK_LEDGER = Symbol('StockLedger');

export type KardexOrigin =
  | 'initial'
  | 'sale'
  | 'sale_cancel'
  | 'credit_note'
  | 'receipt'
  | 'receipt_cancel'
  | 'adjustment'
  | 'transfer';

export interface StockMovement {
  readonly productId: string;
  readonly warehouseId: string;
  /** Signed quantity: positive for entries, negative for exits. */
  readonly quantity: number;
  readonly origin: KardexOrigin;
  readonly reference: string;
  /** Business date of the operation (`YYYY-MM-DD`), stored in the kardex. */
  readonly date: string;
  /** Entry cost; when present the weighted average cost is recalculated. */
  readonly unitCost?: Money;
}

export interface StockBalance {
  readonly quantity: number;
  readonly unitCost: Money;
}

/**
 * Stock per product and warehouse plus its kardex. `move` throws BusinessError
 * «Stock insuficiente de … en …: hay … …» when the balance would go below zero.
 */
export interface StockLedger {
  move(movement: StockMovement): Promise<StockBalance>;
  initializeForProduct(productId: string): Promise<void>;
  initializeForWarehouse(warehouseId: string): Promise<void>;
}
