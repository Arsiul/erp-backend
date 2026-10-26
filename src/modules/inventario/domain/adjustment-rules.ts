import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { optionalText, pickEnum } from '../../../shared/domain/validation/field-rules';
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_TYPES,
  type AdjustmentReason,
  type AdjustmentType,
} from './inventory';
import { positiveUnits } from './inventory-fields';
import { requireActiveRecord } from '../../../shared/domain/validation/record-rules';
import type { CatalogProduct, CatalogWarehouse, InventoryCatalog } from './ports/inventory-catalog';

export interface AdjustmentInput {
  readonly date?: unknown;
  readonly productId?: unknown;
  readonly warehouseId?: unknown;
  readonly type?: unknown;
  readonly quantity?: unknown;
  readonly reason?: unknown;
  readonly notes?: unknown;
}

export interface AdjustmentDraft {
  readonly product: CatalogProduct;
  readonly warehouse: CatalogWarehouse;
  readonly type: AdjustmentType;
  readonly quantity: number;
  readonly reason: AdjustmentReason;
  readonly notes: string;
}

/** Validates an adjustment in the order of the form; the date is checked after the stock move. */
export async function adjustmentDraft(
  input: AdjustmentInput,
  catalog: InventoryCatalog,
): Promise<AdjustmentDraft> {
  const product = await requireActiveRecord(
    input.productId,
    (id) => catalog.findProduct(id),
    'el producto',
  );
  const warehouse = await requireActiveRecord(
    input.warehouseId,
    (id) => catalog.findWarehouse(id),
    'el almacén',
  );
  const type = pickEnum(input.type, ADJUSTMENT_TYPES, 'Elige si el ajuste suma o resta.');
  const quantity = positiveUnits(input.quantity);
  const reason = pickEnum(input.reason, ADJUSTMENT_REASONS, 'Elige el motivo.');
  const notes = optionalText(input.notes);
  if (reason === 'other' && !notes) {
    throw new BusinessError('Explica el motivo del ajuste en las notas.');
  }
  return { product, warehouse, type, quantity, reason, notes };
}

export const signedQuantity = (draft: Pick<AdjustmentDraft, 'type' | 'quantity'>): number =>
  draft.type === 'increase' ? draft.quantity : -draft.quantity;
