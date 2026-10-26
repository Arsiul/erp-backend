import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { MAX_INTEGER } from '../../../shared/domain/validation/numeric-limits';
import { requireNumber } from '../../../shared/domain/validation/value-rules';

const UNITS_MESSAGE = 'La cantidad debe ser un entero mayor que cero.';

export function positiveUnits(value: unknown): number {
  const quantity = requireNumber(value, UNITS_MESSAGE);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_INTEGER) {
    throw new BusinessError(UNITS_MESSAGE);
  }
  return quantity;
}

const MIN_STOCK_MESSAGE = 'El stock mínimo debe ser un entero desde 0.';

export function minStockValue(value: unknown): number {
  const minStock = requireNumber(value, MIN_STOCK_MESSAGE);
  if (!Number.isInteger(minStock) || minStock < 0 || minStock > MAX_INTEGER) {
    throw new BusinessError(MIN_STOCK_MESSAGE);
  }
  return minStock;
}
