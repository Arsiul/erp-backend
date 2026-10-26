import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type { PayableFilter, PayableRecord, PayableValues } from '../payable';
import type {
  PurchaseLine,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  PurchaseOrderValues,
} from '../purchase-order';
import type { ReceiptRecord, ReceiptStatus, ReceiptValues } from '../receipt';
import type {
  SupplierInvoiceRecord,
  SupplierInvoiceStatus,
  SupplierInvoiceValues,
} from '../supplier-invoice';

export const PURCHASE_ORDER_REPOSITORY = Symbol('PurchaseOrderRepository');
export const RECEIPT_REPOSITORY = Symbol('ReceiptRepository');
export const SUPPLIER_INVOICE_REPOSITORY = Symbol('SupplierInvoiceRepository');
export const PAYABLE_REPOSITORY = Symbol('PayableRepository');

/** `q` searches number, supplier and warehouse; `from`/`to` apply to the issue date. */
export interface PurchaseOrderCriteria extends ListCriteria {
  readonly status: PurchaseOrderStatus | undefined;
  readonly supplierId: string | undefined;
  readonly warehouseId: string | undefined;
}

export interface PurchaseOrderRepository {
  list(criteria: PurchaseOrderCriteria): Promise<ListResult<PurchaseOrderRecord>>;
  findById(id: string): Promise<PurchaseOrderRecord | null>;
  /** Reads the order locking its row until the UnitOfWork ends. */
  findForUpdate(id: string): Promise<PurchaseOrderRecord | null>;
  create(number: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord>;
  /** Replaces the header and the lines; nothing is received yet in a draft. */
  update(id: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord>;
  setStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrderRecord>;
  /** Writes what each line received and the resulting status. */
  setProgress(
    id: string,
    lines: readonly PurchaseLine[],
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderRecord>;
  remove(id: string): Promise<void>;
}

/** `q` searches number, order, supplier and guide; `from`/`to` apply to the reception date. */
export interface ReceiptCriteria extends ListCriteria {
  readonly status: ReceiptStatus | undefined;
  readonly purchaseOrderId: string | undefined;
  readonly supplierId: string | undefined;
}

export interface ReceiptRepository {
  list(criteria: ReceiptCriteria): Promise<ListResult<ReceiptRecord>>;
  findById(id: string): Promise<ReceiptRecord | null>;
  findForUpdate(id: string): Promise<ReceiptRecord | null>;
  /** Every receipt of the order, cancelled ones included. */
  listByOrder(purchaseOrderId: string): Promise<readonly ReceiptRecord[]>;
  create(number: string, values: ReceiptValues): Promise<ReceiptRecord>;
  setGuideNumber(id: string, guideNumber: string): Promise<ReceiptRecord>;
  setStatus(
    id: string,
    status: ReceiptStatus,
    supplierInvoiceNumber: string,
  ): Promise<ReceiptRecord>;
}

/** `q` searches document number, supplier and receipt; `from`/`to` apply to the issue date. */
export interface SupplierInvoiceCriteria extends ListCriteria {
  readonly status: SupplierInvoiceStatus | undefined;
  readonly supplierId: string | undefined;
  readonly receiptId: string | undefined;
}

export interface SupplierInvoiceRepository {
  list(criteria: SupplierInvoiceCriteria): Promise<ListResult<SupplierInvoiceRecord>>;
  findById(id: string): Promise<SupplierInvoiceRecord | null>;
  findForUpdate(id: string): Promise<SupplierInvoiceRecord | null>;
  /** Whether the supplier has a non-cancelled invoice with that number. */
  existsActive(supplierId: string, documentNumber: string): Promise<boolean>;
  /** Fails with a conflict when the number is taken concurrently. */
  create(values: SupplierInvoiceValues): Promise<SupplierInvoiceRecord>;
  cancel(id: string): Promise<SupplierInvoiceRecord>;
}

/**
 * `q` searches document number and supplier; `from`/`to` apply to the due date. `overdue` keeps
 * the pending or partial payables due before `today`.
 */
export interface PayableCriteria extends ListCriteria {
  readonly status: PayableFilter | undefined;
  readonly supplierId: string | undefined;
  readonly today: string;
}

export interface PayableRepository {
  list(criteria: PayableCriteria): Promise<ListResult<PayableRecord>>;
  findById(id: string): Promise<PayableRecord | null>;
  findByInvoiceForUpdate(supplierInvoiceId: string): Promise<PayableRecord | null>;
  create(values: PayableValues): Promise<PayableRecord>;
  /** Leaves the balance at zero and the status `cancelled`. */
  cancel(id: string): Promise<PayableRecord>;
}
