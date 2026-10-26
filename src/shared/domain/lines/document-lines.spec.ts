import { Money } from '../money/money';
import { MAX_AMOUNT, MAX_INTEGER } from '../validation/numeric-limits';
import { byId, type LineProduct, type LineRow, normalizeLines, priceOf } from './document-lines';

interface Product extends LineProduct {
  readonly price: number;
}

const PRODUCTS = byId<Product>([
  { id: 'p1', name: 'Teclado', sku: 'SKU-p1', price: 50 },
  { id: 'p2', name: 'Mouse', sku: 'SKU-p2', price: 20 },
]);
const priceOfProduct = (product: Product): unknown => product.price;
const normalize = (rows: readonly LineRow[]) => normalizeLines(rows, PRODUCTS, priceOfProduct);
const row = (productId: string, quantity: unknown, unitPrice?: unknown): LineRow => ({
  productId,
  quantity,
  unitPrice,
});

describe('document lines', () => {
  it('reads prices from money, numbers and numeric text', () => {
    expect(priceOf(Money.of(12.5))).toBe(12.5);
    expect(priceOf(3)).toBe(3);
    expect(priceOf(' 3.40 ')).toBe(3.4);
    expect(priceOf('abc')).toBeNaN();
    for (const value of ['  ', null, undefined, {}]) {
      expect(priceOf(value)).toBeUndefined();
    }
  });

  it('indexes records by id', () => {
    expect([...PRODUCTS.keys()]).toEqual(['p1', 'p2']);
  });

  it('normalizes lines taking the fallback price when none is sent', () => {
    const lines = normalize([row('p1', '2'), row('p2', 1, '25.5')]);
    expect(lines.map((line) => ({ ...line, unitPrice: line.unitPrice.toNumber() }))).toEqual([
      { productId: 'p1', productName: 'Teclado', sku: 'SKU-p1', quantity: 2, unitPrice: 50 },
      { productId: 'p2', productName: 'Mouse', sku: 'SKU-p2', quantity: 1, unitPrice: 25.5 },
    ]);
  });

  it('accepts a zero price and uses the fallback for a null price', () => {
    expect(normalize([row('p1', 1, 0)])[0]?.unitPrice.toNumber()).toBe(0);
    expect(normalize([row('p1', 1, null)])[0]?.unitPrice.toNumber()).toBe(50);
  });

  it('rejects empty, unknown and repeated products', () => {
    expect(() => normalize([])).toThrow('Agrega al menos un producto.');
    expect(() => normalize([row('p9', 1)])).toThrow('Uno de los productos ya no existe.');
    expect(() => normalize([row('p1', 1), row('p1', 2)])).toThrow(
      'Teclado está repetido; junta las cantidades en una línea.',
    );
  });

  it('accepts a quantity and a price at their column limits', () => {
    const [line] = normalize([row('p1', MAX_INTEGER, MAX_AMOUNT)]);
    expect(line?.quantity).toBe(MAX_INTEGER);
    expect(line?.unitPrice.toNumber()).toBe(MAX_AMOUNT);
  });

  it.each([0, -1, 1.5, 'abc', MAX_INTEGER + 1, 1e20])('rejects the quantity %p', (quantity) => {
    expect(() => normalize([row('p2', quantity)])).toThrow(
      'La cantidad de Mouse debe ser un entero mayor que cero.',
    );
  });

  it.each([-1, 'abc', '  ', {}, 1_000_000_000_000, 1e20])('rejects the price %p', (unitPrice) => {
    expect(() => normalizeLines([row('p2', 1, unitPrice)], PRODUCTS, () => undefined)).toThrow(
      'El precio de Mouse no es válido.',
    );
  });
});
