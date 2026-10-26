import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { computeTotals } from '../../../shared/domain/money/igv';
import { normalizeLines as normalizeProductLines } from '../../../shared/domain/lines/document-lines';
import { Money } from '../../../shared/domain/money/money';
import { formatCode } from '../../../shared/domain/numbering/document-number';
import { pickEnum, requireText } from '../../../shared/domain/validation/field-rules';
import {
  type CommercialSettings,
  type CustomerRef,
  type DocumentLine,
  type DocumentTotals,
  INVOICE_KINDS,
  type InvoiceKind,
  type InvoiceRecord,
  type ProductRef,
  type QuoteRecord,
  type QuoteStatus,
  type ReceivableRecord,
  type SaleRecord,
} from './commercial';

/** Keys of SEQUENCE_GENERATOR; the electronic series use `serie:<series>`. */
export const QUOTE_SEQUENCE = 'cotizaciones';
export const SALE_SEQUENCE = 'ventas';
export const seriesSequence = (series: string): string => `serie:${series}`;

/** `F001-00000001`: electronic series are padded to eight digits. */
export const seriesNumber = (series: string, counter: number): string =>
  formatCode(`${series}-`, counter, 8);

interface LineInput {
  readonly productId?: unknown;
  readonly quantity?: unknown;
  readonly unitPrice?: unknown;
}

const lineRows = (input: unknown): LineInput[] =>
  Array.isArray(input)
    ? input.filter((row): row is LineInput => typeof row === 'object' && row !== null)
    : [];

const hasProduct = (row: LineInput): boolean =>
  row.productId !== undefined && row.productId !== null && row.productId !== '';

/** Product ids referenced by the lines of a form, to look them up in one query. */
export const lineProductIds = (input: unknown): string[] => [
  ...new Set(
    lineRows(input)
      .filter(hasProduct)
      .map((row) => String(row.productId)),
  ),
];

/** Credit note lines: only the rows with a positive quantity are credited. */
export const positiveRows = (input: unknown): LineInput[] =>
  lineRows(input).filter((row) => Number(row.quantity) > 0);

/**
 * Lines of a document as the frontend `normalizeLines`: known, unrepeated products with an integer
 * quantity and a non-negative price (`defaultPrice` when the row has none).
 */
export function normalizeLines(
  input: unknown,
  products: ReadonlyMap<string, ProductRef>,
  defaultPrice: (product: ProductRef) => number | undefined,
): DocumentLine[] {
  const rows = lineRows(input)
    .filter(hasProduct)
    .map((row) => ({
      productId: String(row.productId),
      quantity: row.quantity,
      unitPrice: row.unitPrice,
    }));
  return normalizeProductLines(rows, products, defaultPrice).map((line) => ({
    ...line,
    unitPrice: line.unitPrice.toNumber(),
  }));
}

export function totalsOf(lines: readonly DocumentLine[], igvRate: string): DocumentTotals {
  const totals = computeTotals(lines, igvRate);
  return {
    subtotal: totals.subtotal.toNumber(),
    igv: totals.igv.toNumber(),
    total: totals.total.toNumber(),
  };
}

export const requireSeller = (value: unknown): string => requireText(value, 'Elige el vendedor.');

// Quotes

export function assertQuoteEditable(quote: QuoteRecord): void {
  if (quote.status !== 'draft' && quote.status !== 'sent') {
    throw new BusinessError('Solo se editan cotizaciones en borrador o enviadas.');
  }
}

export function assertQuoteValidity(issuedAt: string, validUntil: string): void {
  if (validUntil < issuedAt) {
    throw new BusinessError('La validez no puede ser anterior a la emisión.');
  }
}

export function assertQuoteRemovable(quote: QuoteRecord): void {
  if (quote.status !== 'draft') {
    throw new BusinessError('Solo se eliminan cotizaciones en borrador; rechaza las demás.');
  }
}

/** Status reached by `send`, `accept` or `reject`; `today` is the Lima day. */
export function quoteActionStatus(action: string, quote: QuoteRecord, today: string): QuoteStatus {
  if (action === 'send') {
    if (quote.status !== 'draft') {
      throw new BusinessError('Solo se envían cotizaciones en borrador.');
    }
    return 'sent';
  }
  if (action === 'accept') {
    if (quote.status !== 'draft' && quote.status !== 'sent') {
      throw new BusinessError('Solo se aceptan cotizaciones en borrador o enviadas.');
    }
    if (quote.validUntil < today) {
      throw new BusinessError('La cotización venció; actualiza su validez antes de aceptarla.');
    }
    return 'accepted';
  }
  if (quote.status === 'converted' || quote.status === 'rejected') {
    throw new BusinessError('La cotización ya está cerrada.');
  }
  return 'rejected';
}

// Sales

export function assertQuoteConvertible(quote: QuoteRecord): void {
  if (quote.status !== 'accepted') {
    throw new BusinessError(`La cotización ${quote.number} no está aceptada.`);
  }
}

export function assertQuoteCustomer(quote: QuoteRecord | null, customer: CustomerRef): void {
  if (quote !== null && quote.customerId !== customer.id) {
    throw new BusinessError('La venta debe ser para el cliente de la cotización.');
  }
}

const availableCredit = (customer: CustomerRef, exposure: number): Money =>
  Money.of(customer.creditLimit).minus(Money.of(exposure));

/** A credit sale needs approved credit days and a total within the available credit. */
export function assertCreditSale(customer: CustomerRef, total: number, exposure: number): void {
  if (customer.creditDays <= 0) {
    throw new BusinessError(`${customer.name} no tiene crédito aprobado; véndele al contado.`);
  }
  const available = availableCredit(customer, exposure);
  if (Money.of(total).greaterThan(available)) {
    throw new BusinessError(
      `La venta supera el crédito disponible de ${customer.name} (S/ ${available.toFixed()}).`,
    );
  }
}

/** Switching a pending sale from cash to credit. */
export function assertCreditChange(customer: CustomerRef, total: number, exposure: number): void {
  const available = availableCredit(customer, exposure);
  if (customer.creditDays <= 0 || Money.of(total).greaterThan(available)) {
    throw new BusinessError(`${customer.name} no tiene crédito suficiente para esta venta.`);
  }
}

export function assertSaleEditable(sale: SaleRecord): void {
  if (sale.status !== 'pending_invoice') {
    throw new BusinessError('Solo se editan ventas pendientes de facturar.');
  }
}

export function assertSaleCancellable(sale: SaleRecord): void {
  if (sale.status !== 'pending_invoice') {
    throw new BusinessError(
      'Solo se anulan ventas sin facturar; para una facturada, anula el comprobante primero.',
    );
  }
}

// Invoices

export function assertSaleInvoiceable(sale: SaleRecord): void {
  if (sale.status !== 'pending_invoice') {
    throw new BusinessError(`La venta ${sale.number} ya fue facturada o está anulada.`);
  }
}

/** Factura for a RUC customer, boleta otherwise; a factura demands a RUC. */
export function invoiceKind(value: unknown, customer: CustomerRef): InvoiceKind {
  const kind = pickEnum(
    value,
    INVOICE_KINDS,
    'Elige factura o boleta.',
    customer.documentType === 'RUC' ? 'factura' : 'boleta',
  );
  if (kind === 'factura' && customer.documentType !== 'RUC') {
    throw new BusinessError('La factura exige un cliente con RUC; emite una boleta.');
  }
  return kind;
}

export function assertInvoiceDate(issuedAt: string, sale: SaleRecord): void {
  if (issuedAt < sale.issuedAt) {
    throw new BusinessError('El comprobante no puede ser anterior a la venta.');
  }
}

export const invoiceSeries = (kind: InvoiceKind, settings: CommercialSettings): string =>
  kind === 'factura' ? settings.invoiceSeries : settings.receiptSeries;

export const creditNoteSeries = (kind: InvoiceKind, settings: CommercialSettings): string =>
  kind === 'factura' ? settings.creditNoteSeries : settings.creditNoteSeries.replace(/^F/, 'B');

export const customerDocument = (customer: CustomerRef): string =>
  `${customer.documentType} ${customer.documentNumber}`;

export function requireReceivable(
  receivable: ReceivableRecord | null,
  invoice: InvoiceRecord,
): ReceivableRecord {
  if (receivable === null) {
    throw new BusinessError(`El comprobante ${invoice.number} no tiene cuenta por cobrar.`);
  }
  return receivable;
}

export function assertInvoiceCancellable(invoice: InvoiceRecord): void {
  if (invoice.status !== 'issued') {
    throw new BusinessError('El comprobante ya está anulado.');
  }
}

export function assertReceivableUntouched(
  receivable: ReceivableRecord,
  invoice: InvoiceRecord,
): void {
  if (receivable.paidAmount > 0) {
    throw new BusinessError('El comprobante tiene cobros; anúlalos en Tesorería antes.');
  }
  if (invoice.creditedAmount > 0) {
    throw new BusinessError('El comprobante tiene notas de crédito; ya no se puede anular.');
  }
}

// Credit notes

export function assertInvoiceIssued(invoice: InvoiceRecord): void {
  if (invoice.status !== 'issued') {
    throw new BusinessError(`El comprobante ${invoice.number} está anulado.`);
  }
}

/** Checks each credited line against the invoice and the units already credited. */
export function assertCreditableLines(
  lines: readonly DocumentLine[],
  invoice: InvoiceRecord,
  credited: ReadonlyMap<string, number>,
): void {
  const invoiced = new Map(invoice.lines.map((line) => [line.productId, line]));
  for (const line of lines) {
    const original = invoiced.get(line.productId);
    if (original === undefined) {
      throw new BusinessError(`${line.productName} no está en el comprobante ${invoice.number}.`);
    }
    const available = original.quantity - (credited.get(line.productId) ?? 0);
    if (line.quantity > available) {
      throw new BusinessError(
        `De ${line.productName} solo quedan ${String(available)} unidades por acreditar.`,
      );
    }
    if (line.unitPrice > original.unitPrice) {
      throw new BusinessError(`El precio de ${line.productName} supera el facturado.`);
    }
  }
}

export function assertWithinBalance(total: number, receivable: ReceivableRecord): void {
  if (Money.of(total).greaterThan(Money.of(receivable.balance))) {
    throw new BusinessError(
      `La nota (S/ ${Money.of(total).toFixed()}) supera el saldo por cobrar (S/ ${Money.of(receivable.balance).toFixed()}).`,
    );
  }
}
