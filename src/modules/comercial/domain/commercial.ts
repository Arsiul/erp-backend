import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'converted'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const SALE_STATUSES = ['pending_invoice', 'invoiced', 'cancelled'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_TERMS = ['cash', 'credit'] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const INVOICE_KINDS = ['factura', 'boleta'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ['issued', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CREDIT_NOTE_REASONS = ['return', 'discount', 'error'] as const;
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export const RECEIVABLE_STATUSES = ['pending', 'partial', 'paid', 'cancelled'] as const;
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

/** Pseudo status of the list filters: open quotes past their validity, receivables past due. */
export const OVERDUE = 'overdue';
export const QUOTE_FILTERS = [...QUOTE_STATUSES, OVERDUE] as const;
export type QuoteFilter = (typeof QUOTE_FILTERS)[number];
export const RECEIVABLE_FILTERS = [...RECEIVABLE_STATUSES, OVERDUE] as const;
export type ReceivableFilter = (typeof RECEIVABLE_FILTERS)[number];

export interface DocumentLine {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface DocumentTotals {
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
}

export interface QuoteRecord extends DocumentTotals {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly seller: string;
  readonly lines: readonly DocumentLine[];
  readonly status: QuoteStatus;
  readonly saleNumber: string;
  readonly notes: string;
}

export type QuoteValues = Omit<QuoteRecord, 'id'>;

export interface SaleRecord extends DocumentTotals {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** `''` when the sale was not converted from a quote. */
  readonly quoteId: string;
  readonly quoteNumber: string;
  readonly issuedAt: string;
  readonly seller: string;
  readonly paymentTerm: PaymentTerm;
  readonly lines: readonly DocumentLine[];
  readonly status: SaleStatus;
  /** `''` while the sale has no current invoice. */
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly notes: string;
}

export type SaleValues = Omit<SaleRecord, 'id'>;
export type SaleEdit = Pick<SaleRecord, 'seller' | 'paymentTerm' | 'notes'>;

export interface InvoiceRecord extends DocumentTotals {
  readonly id: string;
  readonly kind: InvoiceKind;
  readonly number: string;
  readonly saleId: string;
  readonly saleNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerDocument: string;
  readonly warehouseId: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly lines: readonly DocumentLine[];
  readonly creditedAmount: number;
  readonly status: InvoiceStatus;
}

export type InvoiceValues = Omit<InvoiceRecord, 'id'>;

export interface CreditNoteRecord extends DocumentTotals {
  readonly id: string;
  readonly number: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly issuedAt: string;
  readonly reason: CreditNoteReason;
  readonly lines: readonly DocumentLine[];
  readonly notes: string;
}

export type CreditNoteValues = Omit<CreditNoteRecord, 'id'>;

export interface ReceivableRecord {
  readonly id: string;
  readonly invoiceId: string;
  readonly documentNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly creditedAmount: number;
  readonly balance: number;
  readonly status: ReceivableStatus;
}

export type ReceivableValues = Omit<ReceivableRecord, 'id'>;
export type ReceivableBalance = Pick<ReceivableRecord, 'creditedAmount' | 'balance' | 'status'>;

export interface CustomerRef {
  readonly id: string;
  readonly name: string;
  readonly documentType: 'RUC' | 'DNI' | 'CE';
  readonly documentNumber: string;
  readonly creditDays: number;
  readonly creditLimit: number;
  readonly status: ActiveStatus;
}

export interface WarehouseRef {
  readonly id: string;
  readonly name: string;
  readonly status: ActiveStatus;
}

export interface ProductRef {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly salePrice: number;
}

export interface CommercialSettings {
  readonly igvRate: string;
  readonly invoiceSeries: string;
  readonly receiptSeries: string;
  readonly creditNoteSeries: string;
  readonly quoteValidityDays: number;
}
