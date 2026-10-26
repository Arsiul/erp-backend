import type { LineRow, ProductLine } from '../../../shared/domain/lines/document-lines';

/** A product line of an order or a receipt; `unitPrice` excludes IGV. */
export type DocumentLine = ProductLine;

export interface DocumentLineView {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const idOf = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/**
 * The rows that name a product; only `productId`, `quantity` and `unitPrice` are read and anything
 * that is not an array counts as no rows.
 */
export function lineRows(input: unknown): LineRow[] {
  const rows = Array.isArray(input) ? (input as unknown[]) : [];
  return rows.filter(isObject).flatMap((row) => {
    const productId = idOf(row['productId']);
    return productId === ''
      ? []
      : [{ productId, quantity: row['quantity'], unitPrice: row['unitPrice'] }];
  });
}

export const productIdsOf = (rows: readonly LineRow[]): string[] => [
  ...new Set(rows.map((row) => row.productId)),
];

export const toLineView = (line: DocumentLine): DocumentLineView => ({
  productId: line.productId,
  productName: line.productName,
  sku: line.sku,
  quantity: line.quantity,
  unitPrice: line.unitPrice.toNumber(),
});
