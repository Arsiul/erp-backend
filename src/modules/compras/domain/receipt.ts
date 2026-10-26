import type { Money } from '../../../shared/domain/money/money';
import { type DocumentLine, type DocumentLineView, toLineView } from './purchase-lines';

export type ReceiptStatus = 'pending_bill' | 'billed' | 'cancelled';

export const RECEIPT_STATUSES = [
  'pending_bill',
  'billed',
  'cancelled',
] as const satisfies readonly ReceiptStatus[];

/** What a receipt writes when it is registered; it starts `pending_bill`. */
export interface ReceiptValues {
  readonly purchaseOrderId: string;
  readonly purchaseOrderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly receivedAt: string;
  readonly guideNumber: string;
  readonly lines: readonly DocumentLine[];
  readonly subtotal: Money;
}

export interface ReceiptRecord extends ReceiptValues {
  readonly id: string;
  readonly number: string;
  readonly status: ReceiptStatus;
  /** The supplier invoice that billed it; empty while it is not billed. */
  readonly supplierInvoiceNumber: string;
}

export interface ReceiptView {
  readonly id: string;
  readonly number: string;
  readonly purchaseOrderId: string;
  readonly purchaseOrderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly receivedAt: string;
  readonly guideNumber: string;
  readonly lines: readonly DocumentLineView[];
  readonly subtotal: number;
  readonly status: ReceiptStatus;
  readonly supplierInvoiceNumber: string;
}

export const toReceiptView = (receipt: ReceiptRecord): ReceiptView => ({
  id: receipt.id,
  number: receipt.number,
  purchaseOrderId: receipt.purchaseOrderId,
  purchaseOrderNumber: receipt.purchaseOrderNumber,
  supplierId: receipt.supplierId,
  supplierName: receipt.supplierName,
  warehouseId: receipt.warehouseId,
  warehouseName: receipt.warehouseName,
  receivedAt: receipt.receivedAt,
  guideNumber: receipt.guideNumber,
  lines: receipt.lines.map(toLineView),
  subtotal: receipt.subtotal.toNumber(),
  status: receipt.status,
  supplierInvoiceNumber: receipt.supplierInvoiceNumber,
});
