import { BusinessError } from '../errors/domain-error';
import { Money } from '../money/money';
import { MAX_AMOUNT, MAX_INTEGER } from '../validation/numeric-limits';

/** The product data a document line copies. */
export interface LineProduct {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
}

/** A line as the client sends it, once its `productId` has been read as text. */
export interface LineRow {
  readonly productId: string;
  readonly quantity: unknown;
  readonly unitPrice: unknown;
}

/** A validated product line; `unitPrice` excludes IGV. */
export interface ProductLine {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

/** A price sent as a number, a numeric string or a `Money`; `undefined` when it is not usable. */
export function priceOf(value: unknown): number | undefined {
  if (value instanceof Money) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return undefined;
}

/** The records indexed by their id. */
export const byId = <T extends { readonly id: string }>(records: readonly T[]): Map<string, T> =>
  new Map(records.map((record) => [record.id, record]));

/**
 * The lines of a document, validated as the frontend `normalizeLines`: at least one product,
 * known and unrepeated, integer quantities above zero and prices that are finite and not
 * negative, both within their column limits. A row without price takes `fallbackPrice(product)`, which may also reject it.
 */
export function normalizeLines<P extends LineProduct>(
  rows: readonly LineRow[],
  products: ReadonlyMap<string, P>,
  fallbackPrice: (product: P) => unknown,
): ProductLine[] {
  if (rows.length === 0) {
    throw new BusinessError('Agrega al menos un producto.');
  }
  const seen = new Set<string>();
  return rows.map((row) => {
    const product = products.get(row.productId);
    if (product === undefined) {
      throw new BusinessError('Uno de los productos ya no existe.');
    }
    if (seen.has(product.id)) {
      throw new BusinessError(`${product.name} está repetido; junta las cantidades en una línea.`);
    }
    seen.add(product.id);
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_INTEGER) {
      throw new BusinessError(`La cantidad de ${product.name} debe ser un entero mayor que cero.`);
    }
    const unitPrice = priceOf(row.unitPrice ?? fallbackPrice(product));
    if (
      unitPrice === undefined ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > MAX_AMOUNT
    ) {
      throw new BusinessError(`El precio de ${product.name} no es válido.`);
    }
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity,
      unitPrice: Money.of(unitPrice),
    };
  });
}
