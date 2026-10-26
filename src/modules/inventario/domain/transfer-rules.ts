import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { optionalText } from '../../../shared/domain/validation/field-rules';
import type { TransferRecord, TransferValues } from './inventory';
import { positiveUnits } from './inventory-fields';
import { requireActiveRecord } from '../../../shared/domain/validation/record-rules';
import { requireDate } from '../../../shared/domain/validation/value-rules';
import type { InventoryCatalog } from './ports/inventory-catalog';

export interface TransferInput {
  readonly date?: unknown;
  readonly productId?: unknown;
  readonly originWarehouseId?: unknown;
  readonly destinationWarehouseId?: unknown;
  readonly quantity?: unknown;
  readonly notes?: unknown;
}

/** Validates a pending transfer against the stock available in the origin today. */
export async function transferValues(
  input: TransferInput,
  catalog: InventoryCatalog,
  today: string,
): Promise<TransferValues> {
  const product = await requireActiveRecord(
    input.productId,
    (id) => catalog.findProduct(id),
    'el producto',
  );
  const findWarehouse = (id: string) => catalog.findWarehouse(id);
  const origin = await requireActiveRecord(
    input.originWarehouseId,
    findWarehouse,
    'el almacén de origen',
  );
  const destination = await requireActiveRecord(
    input.destinationWarehouseId,
    findWarehouse,
    'el almacén de destino',
  );
  if (origin.id === destination.id) {
    throw new BusinessError('El origen y el destino deben ser almacenes distintos.');
  }
  const quantity = positiveUnits(input.quantity);
  const available = (await catalog.findStock(product.id, origin.id))?.quantity ?? 0;
  if (quantity > available) {
    throw new BusinessError(
      `En ${origin.name} solo hay ${String(available)} ${product.unit} de ${product.name}.`,
    );
  }
  return {
    date: requireDate(input.date, today),
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    originWarehouseId: origin.id,
    originWarehouseName: origin.name,
    destinationWarehouseId: destination.id,
    destinationWarehouseName: destination.name,
    quantity,
    notes: optionalText(input.notes),
  };
}

export function assertEditable(transfer: TransferRecord): void {
  if (transfer.status !== 'pending') {
    throw new BusinessError('Solo se editan transferencias pendientes.');
  }
}

export function assertCompletable(transfer: TransferRecord): void {
  if (transfer.status !== 'pending') {
    throw new BusinessError('La transferencia ya está cerrada.');
  }
}

export function assertCancellable(transfer: TransferRecord): void {
  if (transfer.status !== 'pending') {
    throw new BusinessError('Solo se anulan transferencias pendientes.');
  }
}
