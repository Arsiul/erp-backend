import type { Money } from '../../../shared/domain/money/money';

export type SupplierInvoiceStatus = 'registered' | 'cancelled';

export const SUPPLIER_INVOICE_STATUSES = [
  'registered',
  'cancelled',
] as const satisfies readonly SupplierInvoiceStatus[];

/** What registering a supplier invoice writes; `receiptId` is `null` for an invoice without receipt. */
export interface SupplierInvoiceValues {
  readonly documentNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly receiptId: string | null;
  readonly receiptNumber: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly subtotal: Money;
  readonly igv: Money;
  readonly total: Money;
}

export interface SupplierInvoiceRecord extends SupplierInvoiceValues {
  readonly id: string;
  readonly status: SupplierInvoiceStatus;
}

export interface SupplierInvoiceView {
  readonly id: string;
  readonly documentNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  /** `''` when the invoice does not bill a receipt, as the frontend expects. */
  readonly receiptId: string;
  readonly receiptNumber: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
  readonly status: SupplierInvoiceStatus;
}

export const toSupplierInvoiceView = (invoice: SupplierInvoiceRecord): SupplierInvoiceView => ({
  id: invoice.id,
  documentNumber: invoice.documentNumber,
  supplierId: invoice.supplierId,
  supplierName: invoice.supplierName,
  receiptId: invoice.receiptId ?? '',
  receiptNumber: invoice.receiptNumber,
  issuedAt: invoice.issuedAt,
  dueAt: invoice.dueAt,
  subtotal: invoice.subtotal.toNumber(),
  igv: invoice.igv.toNumber(),
  total: invoice.total.toNumber(),
  status: invoice.status,
});
