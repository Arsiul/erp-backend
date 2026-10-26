import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type { KardexOrigin } from '../../../../shared/domain/ports/stock-ledger.port';
import type {
  AdjustmentReason,
  AdjustmentRecord,
  AdjustmentType,
  AdjustmentValues,
  KardexRecord,
  StockRecord,
  TransferRecord,
  TransferStatus,
  TransferValues,
} from '../inventory';

export const STOCK_REPOSITORY = Symbol('StockRepository');
export const KARDEX_REPOSITORY = Symbol('KardexRepository');
export const ADJUSTMENT_REPOSITORY = Symbol('AdjustmentRepository');
export const TRANSFER_REPOSITORY = Symbol('TransferRepository');

/** `q` searches sku, product, category and warehouse; stock rows have no date. */
export interface StockCriteria extends ListCriteria {
  readonly productId: string | undefined;
  readonly warehouseId: string | undefined;
}

export interface StockRepository {
  list(criteria: StockCriteria): Promise<ListResult<StockRecord>>;
  findById(id: string): Promise<StockRecord | null>;
  setMinStock(id: string, minStock: number): Promise<StockRecord>;
}

/** `q` searches sku, product, warehouse and reference; `from`/`to` apply to the movement day. */
export interface KardexCriteria extends ListCriteria {
  readonly productId: string | undefined;
  readonly warehouseId: string | undefined;
  readonly origin: KardexOrigin | undefined;
}

export interface KardexRepository {
  list(criteria: KardexCriteria): Promise<ListResult<KardexRecord>>;
  findById(id: string): Promise<KardexRecord | null>;
}

/** `q` searches number, sku, product and warehouse; `from`/`to` apply to the document day. */
export interface AdjustmentCriteria extends ListCriteria {
  readonly productId: string | undefined;
  readonly warehouseId: string | undefined;
  readonly type: AdjustmentType | undefined;
  readonly reason: AdjustmentReason | undefined;
}

export interface AdjustmentRepository {
  list(criteria: AdjustmentCriteria): Promise<ListResult<AdjustmentRecord>>;
  findById(id: string): Promise<AdjustmentRecord | null>;
  create(values: AdjustmentValues): Promise<AdjustmentRecord>;
}

/** `q` searches number, sku, product and both warehouses; `warehouseId` matches either end. */
export interface TransferCriteria extends ListCriteria {
  readonly status: TransferStatus | undefined;
  readonly productId: string | undefined;
  readonly warehouseId: string | undefined;
}

export interface TransferRepository {
  list(criteria: TransferCriteria): Promise<ListResult<TransferRecord>>;
  findById(id: string): Promise<TransferRecord | null>;
  /** Same as `findById`, holding the row until the transaction ends. */
  lockById(id: string): Promise<TransferRecord | null>;
  create(number: string, values: TransferValues): Promise<TransferRecord>;
  update(id: string, values: TransferValues): Promise<TransferRecord>;
  setStatus(id: string, status: TransferStatus): Promise<TransferRecord>;
}
