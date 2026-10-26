import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { computeTotals } from '../../../shared/domain/money/igv';
import { requireText } from '../../../shared/domain/validation/field-rules';
import type { PurchasingCatalog } from './ports/purchasing-catalog.port';
import { byId, normalizeLines } from '../../../shared/domain/lines/document-lines';
import { requireActive } from '../../../shared/domain/validation/record-rules';
import { requireDate } from '../../../shared/domain/validation/value-rules';
import { type DocumentLine, lineRows, productIdsOf } from './purchase-lines';
import type { PurchaseOrderRecord } from './purchase-order';
import { assertOrderReceivable } from './purchase-order-rules';
import type { ReceiptRecord, ReceiptValues } from './receipt';

/** The body of a receipt create: the order, the guide, the day and the received units. */
export interface ReceiptInput {
  readonly purchaseOrderId?: unknown;
  readonly receivedAt?: unknown;
  readonly guideNumber?: unknown;
  readonly lines?: unknown;
}

/** Only the guide number of a receipt can be corrected. */
export interface ReceiptPatch {
  readonly guideNumber?: unknown;
}

const GUIDE_REQUIRED = 'Escribe el número de la guía de remisión.';

export const guideNumberOf = (value: unknown): string => requireText(value, GUIDE_REQUIRED);

/**
 * The received lines: rows without units are ignored, the price is always the one agreed in the
 * order, and no product may exceed what is still pending.
 */
export async function receivedLines(
  order: PurchaseOrderRecord,
  input: unknown,
  catalog: PurchasingCatalog,
): Promise<DocumentLine[]> {
  const ordered = new Map(order.lines.map((line) => [line.productId, line]));
  const rows = lineRows(input)
    .filter((row) => Number(row.quantity) > 0)
    .map((row) => ({ ...row, unitPrice: undefined }));
  const products = await catalog.findProducts(productIdsOf(rows));
  const lines = normalizeLines(rows, byId(products), (product) => {
    const line = ordered.get(product.id);
    if (line === undefined) {
      throw new BusinessError(`${product.name} no está en la orden ${order.number}.`);
    }
    return line.unitPrice;
  });
  for (const line of lines) {
    const original = ordered.get(line.productId);
    const pending = original === undefined ? 0 : original.quantity - original.receivedQuantity;
    if (line.quantity > pending) {
      throw new BusinessError(
        `De ${line.productName} solo quedan ${String(pending)} unidades por recibir.`,
      );
    }
  }
  return lines;
}

/** Validates a receipt of `order` as the frontend does; the order must accept receipts. */
export async function receiptValues(
  order: PurchaseOrderRecord,
  input: ReceiptInput,
  catalog: PurchasingCatalog,
  today: string,
): Promise<ReceiptValues> {
  assertOrderReceivable(order);
  const warehouse = requireActive(
    await catalog.findWarehouse(order.warehouseId),
    'el almacén de la orden',
  );
  const lines = await receivedLines(order, input.lines, catalog);
  const receivedAt = requireDate(input.receivedAt, today);
  if (receivedAt < order.issuedAt) {
    throw new BusinessError('La recepción no puede ser anterior a la orden.');
  }
  return {
    purchaseOrderId: order.id,
    purchaseOrderNumber: order.number,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    receivedAt,
    guideNumber: guideNumberOf(input.guideNumber),
    lines,
    subtotal: computeTotals(lines, 0).subtotal,
  };
}

export function assertReceiptEditable(receipt: ReceiptRecord): void {
  if (receipt.status === 'cancelled') {
    throw new BusinessError('La recepción está anulada.');
  }
}

export function assertReceiptCancellable(receipt: ReceiptRecord): void {
  if (receipt.status !== 'pending_bill') {
    throw new BusinessError(
      'Solo se anulan recepciones sin facturar; anula la factura del proveedor primero.',
    );
  }
}

/** A supplier invoice can bill only a receipt that is still pending. */
export function assertReceiptBillable(receipt: ReceiptRecord): void {
  if (receipt.status !== 'pending_bill') {
    throw new BusinessError(`La recepción ${receipt.number} ya fue facturada o está anulada.`);
  }
}

/** Units per product of the receipts in force, the input of `receivedProgress`. */
export function receivedByProduct(receipts: readonly ReceiptRecord[]): Map<string, number> {
  const received = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.status === 'cancelled') {
      continue;
    }
    for (const line of receipt.lines) {
      received.set(line.productId, (received.get(line.productId) ?? 0) + line.quantity);
    }
  }
  return received;
}
