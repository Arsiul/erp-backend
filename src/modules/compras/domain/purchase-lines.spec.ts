import { Money } from '../../../shared/domain/money/money';
import type { CatalogProduct } from './ports/purchasing-catalog.port';
import { byId, normalizeLines } from '../../../shared/domain/lines/document-lines';
import { lineRows, productIdsOf, toLineView } from './purchase-lines';

const product = (id: string, name: string, cost: number): CatalogProduct => ({
  id,
  name,
  sku: `SKU-${id}`,
  costPrice: Money.of(cost),
  status: 'active',
});

const PRODUCTS = byId([product('p1', 'Teclado', 50), product('p2', 'Mouse', 20)]);
const costOf = (item: CatalogProduct): unknown => item.costPrice;

describe('purchase lines', () => {
  it('keeps only object rows that name a product', () => {
    const rows = lineRows([
      null,
      'p1',
      { productId: '' },
      { productId: 7, quantity: 2 },
      { productId: 'p1', quantity: '3', unitPrice: '10' },
      { productId: true },
    ]);
    expect(rows).toEqual([
      { productId: '7', quantity: 2, unitPrice: undefined },
      { productId: 'p1', quantity: '3', unitPrice: '10' },
    ]);
    expect(lineRows('nope')).toEqual([]);
    expect(productIdsOf([...rows, ...rows])).toEqual(['7', 'p1']);
  });

  it('turns the normalized lines into their view', () => {
    const lines = normalizeLines(
      lineRows([
        { productId: 'p1', quantity: '2' },
        { productId: 'p2', quantity: 1, unitPrice: '25.5', extra: 'x' },
      ]),
      PRODUCTS,
      costOf,
    );
    expect(lines.map(toLineView)).toEqual([
      { productId: 'p1', productName: 'Teclado', sku: 'SKU-p1', quantity: 2, unitPrice: 50 },
      { productId: 'p2', productName: 'Mouse', sku: 'SKU-p2', quantity: 1, unitPrice: 25.5 },
    ]);
  });
});
