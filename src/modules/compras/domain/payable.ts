import { Money } from '../../../shared/domain/money/money';
import type { PayableStatus } from './payable-settlement';
import type { SupplierInvoiceRecord } from './supplier-invoice';

export const PAYABLE_STATUSES = [
  'pending',
  'partial',
  'paid',
  'cancelled',
] as const satisfies readonly PayableStatus[];

/** The status filter of `/cuentas-pagar` also accepts `overdue`: due before today with balance. */
export const PAYABLE_FILTERS = [...PAYABLE_STATUSES, 'overdue'] as const;
export type PayableFilter = (typeof PAYABLE_FILTERS)[number];

export interface PayableValues {
  readonly supplierInvoiceId: string;
  readonly documentNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: Money;
  readonly paidAmount: Money;
  readonly balance: Money;
  readonly status: PayableStatus;
}

export interface PayableRecord extends PayableValues {
  readonly id: string;
}

export interface PayableView {
  readonly id: string;
  readonly supplierInvoiceId: string;
  readonly documentNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly balance: number;
  readonly status: PayableStatus;
}

/** The payable born with a supplier invoice: the whole total is pending. */
export const payableOf = (invoice: SupplierInvoiceRecord): PayableValues => ({
  supplierInvoiceId: invoice.id,
  documentNumber: invoice.documentNumber,
  supplierId: invoice.supplierId,
  supplierName: invoice.supplierName,
  issuedAt: invoice.issuedAt,
  dueAt: invoice.dueAt,
  amount: invoice.total,
  paidAmount: Money.zero(),
  balance: invoice.total,
  status: 'pending',
});

export const toPayableView = (payable: PayableRecord): PayableView => ({
  id: payable.id,
  supplierInvoiceId: payable.supplierInvoiceId,
  documentNumber: payable.documentNumber,
  supplierId: payable.supplierId,
  supplierName: payable.supplierName,
  issuedAt: payable.issuedAt,
  dueAt: payable.dueAt,
  amount: payable.amount.toNumber(),
  paidAmount: payable.paidAmount.toNumber(),
  balance: payable.balance.toNumber(),
  status: payable.status,
});
