import type { Money } from '../../../shared/domain/money/money';
import type { KardexOrigin } from '../../../shared/domain/ports/stock-ledger.port';

export const KARDEX_ORIGINS = [
  'initial',
  'sale',
  'sale_cancel',
  'credit_note',
  'receipt',
  'receipt_cancel',
  'adjustment',
  'transfer',
] as const satisfies readonly KardexOrigin[];

export const ADJUSTMENT_TYPES = ['increase', 'decrease'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = ['count', 'damage', 'expired', 'loss', 'other'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const TRANSFER_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface StockRecord {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly categoryName: string;
  readonly unit: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly quantity: number;
  readonly minStock: number;
  readonly unitCost: Money;
}

export interface KardexRecord {
  readonly id: string;
  readonly date: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly origin: KardexOrigin;
  readonly reference: string;
  readonly quantity: number;
  readonly balance: number;
  readonly unitCost: Money;
}

export interface AdjustmentValues {
  readonly number: string;
  readonly date: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly type: AdjustmentType;
  readonly quantity: number;
  readonly reason: AdjustmentReason;
  readonly notes: string;
}

export interface AdjustmentRecord extends AdjustmentValues {
  readonly id: string;
}

export interface TransferValues {
  readonly date: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly originWarehouseId: string;
  readonly originWarehouseName: string;
  readonly destinationWarehouseId: string;
  readonly destinationWarehouseName: string;
  readonly quantity: number;
  readonly notes: string;
}

export interface TransferRecord extends TransferValues {
  readonly id: string;
  readonly number: string;
  readonly status: TransferStatus;
}

export type StockView = Omit<StockRecord, 'unitCost'> & { readonly unitCost: number };
export type KardexView = Omit<KardexRecord, 'unitCost'> & { readonly unitCost: number };
export type AdjustmentView = AdjustmentRecord;
export type TransferView = TransferRecord;

export const toStockView = (record: StockRecord): StockView => ({
  ...record,
  unitCost: record.unitCost.toNumber(),
});

export const toKardexView = (record: KardexRecord): KardexView => ({
  ...record,
  unitCost: record.unitCost.toNumber(),
});

export const toAdjustmentView = (record: AdjustmentRecord): AdjustmentView => ({ ...record });

export const toTransferView = (record: TransferRecord): TransferView => ({ ...record });

/** Audit reference of a stock row. */
export const stockReference = (record: StockRecord): string =>
  `${record.productName} · ${record.warehouseName}`;
