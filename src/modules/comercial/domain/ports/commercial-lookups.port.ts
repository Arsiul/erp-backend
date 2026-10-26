import type { CommercialSettings, CustomerRef, ProductRef, WarehouseRef } from '../commercial';

export const COMMERCIAL_LOOKUPS = Symbol('CommercialLookups');

/** Masters, settings and aggregates that commercial documents read. */
export interface CommercialLookups {
  /** `forUpdate` locks the customer row, serializing the credit checks of concurrent sales. */
  customer(id: string, forUpdate?: boolean): Promise<CustomerRef | null>;
  warehouse(id: string): Promise<WarehouseRef | null>;
  /** The products that exist among `ids`, keyed by id. */
  products(ids: readonly string[]): Promise<ReadonlyMap<string, ProductRef>>;
  settings(): Promise<CommercialSettings>;
  /**
   * Current debt of the customer: balances of non-cancelled receivables plus totals of credit
   * sales still pending invoice, except `exceptSaleId`.
   */
  exposure(customerId: string, exceptSaleId?: string): Promise<number>;
  /** Units of each product already credited by the notes of an invoice. */
  creditedQuantities(invoiceId: string): Promise<ReadonlyMap<string, number>>;
}
