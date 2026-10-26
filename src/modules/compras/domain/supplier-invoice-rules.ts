import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { totalsFromSubtotal } from '../../../shared/domain/money/igv';
import { Money } from '../../../shared/domain/money/money';
import { optionalText, requireText } from '../../../shared/domain/validation/field-rules';
import type { PayableRecord } from './payable';
import type { CatalogSupplier, PurchasingCatalog } from './ports/purchasing-catalog.port';
import type { ReceiptRecord } from './receipt';
import { assertReceiptBillable } from './receipt-rules';
import type { SupplierInvoiceRecord, SupplierInvoiceValues } from './supplier-invoice';
import { addDays } from '../../../shared/domain/time/lima-time';
import { requireFound } from '../../../shared/domain/validation/record-rules';
import { requireDate, requireNumber } from '../../../shared/domain/validation/value-rules';

/** The body of a supplier invoice; with `receiptId` the supplier and subtotal come from it. */
export interface SupplierInvoiceInput {
  readonly documentNumber?: unknown;
  readonly supplierId?: unknown;
  readonly receiptId?: unknown;
  readonly issuedAt?: unknown;
  readonly dueAt?: unknown;
  readonly subtotal?: unknown;
}

/** Whether the supplier already has a non-cancelled invoice with that number. */
export type InvoiceNumberTaken = (supplierId: string, documentNumber: string) => Promise<boolean>;

export const invoiceDocumentNumber = (value: unknown): string =>
  requireText(value, 'Escribe el número de la factura del proveedor.').toUpperCase();

/** The supplier of the invoice: the one sent or, without it, the one of the receipt. */
export async function invoiceSupplier(
  input: SupplierInvoiceInput,
  receipt: ReceiptRecord | null,
  catalog: PurchasingCatalog,
): Promise<CatalogSupplier> {
  const supplierId = optionalText(input.supplierId) || (receipt?.supplierId ?? '');
  const supplier = requireFound(
    supplierId === '' ? null : await catalog.findSupplier(supplierId),
    'el proveedor',
  );
  if (receipt !== null && receipt.supplierId !== supplier.id) {
    throw new BusinessError('La factura debe ser del proveedor de la recepción.');
  }
  return supplier;
}

function invoiceSubtotal(input: SupplierInvoiceInput, receipt: ReceiptRecord | null): Money {
  const subtotal =
    receipt === null
      ? Money.of(requireNumber(input.subtotal, 'Escribe el subtotal de la factura.'))
      : receipt.subtotal;
  if (!subtotal.isPositive()) {
    throw new BusinessError('El subtotal debe ser mayor que cero.');
  }
  return subtotal;
}

/**
 * Validates a supplier invoice as the frontend does. `receipt` is the receipt it bills, already
 * looked up, or `null`; the due date defaults to the supplier's payment days.
 */
export async function supplierInvoiceValues(
  input: SupplierInvoiceInput,
  receipt: ReceiptRecord | null,
  catalog: PurchasingCatalog,
  numberTaken: InvoiceNumberTaken,
  today: string,
): Promise<SupplierInvoiceValues> {
  if (receipt !== null) {
    assertReceiptBillable(receipt);
  }
  const supplier = await invoiceSupplier(input, receipt, catalog);
  const documentNumber = invoiceDocumentNumber(input.documentNumber);
  if (await numberTaken(supplier.id, documentNumber)) {
    throw new BusinessError(`Ya registraste la factura ${documentNumber} de ${supplier.name}.`);
  }
  const totals = totalsFromSubtotal(invoiceSubtotal(input, receipt), await catalog.igvRate());
  const issuedAt = requireDate(input.issuedAt, today);
  const dueAt = requireDate(input.dueAt, addDays(issuedAt, supplier.paymentDays));
  if (dueAt < issuedAt) {
    throw new BusinessError('El vencimiento no puede ser anterior a la emisión.');
  }
  return {
    documentNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    receiptId: receipt?.id ?? null,
    receiptNumber: receipt?.number ?? '',
    issuedAt,
    dueAt,
    ...totals,
  };
}

/** Only a registered invoice whose payable has no payments can be cancelled. */
export function assertInvoiceCancellable(
  invoice: SupplierInvoiceRecord,
  payable: PayableRecord | null,
): void {
  if (invoice.status !== 'registered') {
    throw new BusinessError('La factura ya está anulada.');
  }
  if (payable?.paidAmount.isPositive() === true) {
    throw new BusinessError('La factura tiene pagos; anúlalos en Tesorería antes.');
  }
}
