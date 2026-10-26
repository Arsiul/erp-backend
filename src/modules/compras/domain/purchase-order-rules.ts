import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { computeTotals } from '../../../shared/domain/money/igv';
import { optionalText } from '../../../shared/domain/validation/field-rules';
import type {
  PurchaseLine,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  PurchaseOrderValues,
} from './purchase-order';
import { byId, normalizeLines } from '../../../shared/domain/lines/document-lines';
import { addDays } from '../../../shared/domain/time/lima-time';
import { requireActive } from '../../../shared/domain/validation/record-rules';
import { requireDate } from '../../../shared/domain/validation/value-rules';
import { lineRows, productIdsOf } from './purchase-lines';
import type { CatalogSupplier, PurchasingCatalog } from './ports/purchasing-catalog.port';

/** The body of a create or an edit, as the frontend sends it. */
export interface PurchaseOrderInput {
  readonly supplierId?: unknown;
  readonly warehouseId?: unknown;
  readonly issuedAt?: unknown;
  readonly expectedAt?: unknown;
  readonly lines?: unknown;
  readonly notes?: unknown;
}

/** Days between the issue and the expected receipt when the client leaves it empty. */
export const EXPECTED_RECEIPT_DAYS = 7;

const idOf = (value: unknown): string => optionalText(value);

/** The active supplier with that id (`null` id or record answer «Selecciona …»). */
export async function activeSupplier(
  catalog: PurchasingCatalog,
  id: unknown,
): Promise<CatalogSupplier> {
  const supplierId = idOf(id);
  return requireActive(
    supplierId === '' ? null : await catalog.findSupplier(supplierId),
    'el proveedor',
  );
}

/** Validates an order as the frontend does: active supplier and warehouse, dates and lines. */
export async function purchaseOrderValues(
  input: PurchaseOrderInput,
  catalog: PurchasingCatalog,
  today: string,
): Promise<PurchaseOrderValues> {
  const supplier = await activeSupplier(catalog, input.supplierId);
  const warehouseId = idOf(input.warehouseId);
  const warehouse = requireActive(
    warehouseId === '' ? null : await catalog.findWarehouse(warehouseId),
    'el almacén de destino',
  );
  const issuedAt = requireDate(input.issuedAt, today);
  const expectedAt = requireDate(input.expectedAt, addDays(issuedAt, EXPECTED_RECEIPT_DAYS));
  if (expectedAt < issuedAt) {
    throw new BusinessError('La recepción esperada no puede ser anterior a la emisión.');
  }
  const rows = lineRows(input.lines);
  const products = await catalog.findProducts(productIdsOf(rows));
  const lines = normalizeLines(rows, byId(products), (product) => product.costPrice);
  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    issuedAt,
    expectedAt,
    lines,
    ...computeTotals(lines, await catalog.igvRate()),
    notes: optionalText(input.notes),
  };
}

export function assertOrderEditable(order: PurchaseOrderRecord): void {
  if (order.status !== 'draft') {
    throw new BusinessError('Solo se editan órdenes en borrador.');
  }
}

export function assertOrderRemovable(order: PurchaseOrderRecord): void {
  if (order.status !== 'draft') {
    throw new BusinessError('Solo se eliminan órdenes en borrador; anula las demás.');
  }
}

export function assertOrderApprovable(order: PurchaseOrderRecord): void {
  if (order.status !== 'draft') {
    throw new BusinessError('Solo se aprueban órdenes en borrador.');
  }
}

export function assertOrderCancellable(order: PurchaseOrderRecord): void {
  if (order.status !== 'draft' && order.status !== 'approved') {
    throw new BusinessError(
      'La orden ya recibió mercadería o está cerrada; anula sus recepciones primero.',
    );
  }
}

/** Only approved or partially received orders accept receipts. */
export function assertOrderReceivable(order: PurchaseOrderRecord): void {
  if (order.status !== 'approved' && order.status !== 'partial') {
    throw new BusinessError(`La orden ${order.number} no está aprobada o ya se recibió completa.`);
  }
}

export interface ReceivedProgress {
  readonly lines: readonly PurchaseLine[];
  readonly status: PurchaseOrderStatus;
}

/**
 * The lines with what the receipts in force brought (`received`: units per product) and the
 * resulting status: `received` when every line is complete, `partial` when something arrived,
 * `approved` otherwise.
 */
export function receivedProgress(
  order: PurchaseOrderRecord,
  received: ReadonlyMap<string, number>,
): ReceivedProgress {
  const lines = order.lines.map((line) => ({
    ...line,
    receivedQuantity: received.get(line.productId) ?? 0,
  }));
  const total = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const complete = lines.every((line) => line.receivedQuantity >= line.quantity);
  return { lines, status: complete ? 'received' : total > 0 ? 'partial' : 'approved' };
}
