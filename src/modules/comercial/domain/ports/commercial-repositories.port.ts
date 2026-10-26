import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type {
  CreditNoteRecord,
  CreditNoteValues,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceValues,
  QuoteFilter,
  QuoteRecord,
  QuoteStatus,
  QuoteValues,
  ReceivableBalance,
  ReceivableFilter,
  ReceivableRecord,
  ReceivableValues,
  SaleEdit,
  SaleRecord,
  SaleStatus,
  SaleValues,
} from '../commercial';

export const QUOTE_REPOSITORY = Symbol('QuoteRepository');
export const SALE_REPOSITORY = Symbol('SaleRepository');
export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
export const CREDIT_NOTE_REPOSITORY = Symbol('CreditNoteRepository');
export const RECEIVABLE_REPOSITORY = Symbol('ReceivableRepository');

/** Status filter of a list; `today` (Lima day) resolves the `overdue` pseudo status. */
export interface StatusFilter<S extends string> {
  readonly status: S | undefined;
  readonly today: string;
}

/**
 * Every list searches `q` over its numbers and names and applies `from`/`to` to `issuedAt`.
 * `find(id, true)` locks the row until the unit of work ends.
 */
export interface QuoteRepository {
  list(criteria: ListCriteria, filter: StatusFilter<QuoteFilter>): Promise<ListResult<QuoteRecord>>;
  find(id: string, forUpdate?: boolean): Promise<QuoteRecord | null>;
  create(values: QuoteValues): Promise<QuoteRecord>;
  update(id: string, values: QuoteValues): Promise<QuoteRecord>;
  setStatus(id: string, status: QuoteStatus, saleNumber?: string): Promise<QuoteRecord>;
  remove(id: string): Promise<void>;
}

export interface SaleRepository {
  list(criteria: ListCriteria, filter: StatusFilter<SaleStatus>): Promise<ListResult<SaleRecord>>;
  find(id: string, forUpdate?: boolean): Promise<SaleRecord | null>;
  create(values: SaleValues): Promise<SaleRecord>;
  update(id: string, values: SaleEdit): Promise<SaleRecord>;
  setStatus(id: string, status: SaleStatus): Promise<SaleRecord>;
  /** Links the current invoice (`invoiced`) or unlinks it (`pending_invoice`, `null`). */
  setInvoice(id: string, invoice: { id: string; number: string } | null): Promise<SaleRecord>;
}

export interface InvoiceRepository {
  list(
    criteria: ListCriteria,
    filter: StatusFilter<InvoiceStatus>,
  ): Promise<ListResult<InvoiceRecord>>;
  find(id: string, forUpdate?: boolean): Promise<InvoiceRecord | null>;
  create(values: InvoiceValues): Promise<InvoiceRecord>;
  setStatus(id: string, status: InvoiceStatus): Promise<InvoiceRecord>;
  setCreditedAmount(id: string, creditedAmount: number): Promise<InvoiceRecord>;
}

export interface CreditNoteRepository {
  list(criteria: ListCriteria): Promise<ListResult<CreditNoteRecord>>;
  find(id: string): Promise<CreditNoteRecord | null>;
  create(values: CreditNoteValues): Promise<CreditNoteRecord>;
}

/** Receivable list filter: the status filter narrowed to one customer when given. */
export interface ReceivableListFilter extends StatusFilter<ReceivableFilter> {
  readonly customerId: string | undefined;
}

export interface ReceivableRepository {
  list(criteria: ListCriteria, filter: ReceivableListFilter): Promise<ListResult<ReceivableRecord>>;
  find(id: string): Promise<ReceivableRecord | null>;
  /** The receivable of an invoice, locked when `forUpdate`. */
  findByInvoice(invoiceId: string, forUpdate?: boolean): Promise<ReceivableRecord | null>;
  create(values: ReceivableValues): Promise<ReceivableRecord>;
  setBalance(id: string, values: ReceivableBalance): Promise<ReceivableRecord>;
}
