import {
  amountOf,
  type DecimalColumn,
  decimalOf,
} from '../../../shared/infrastructure/prisma/decimal-columns';
import type { DocumentLine, DocumentTotals } from '../domain/commercial';

interface LineRow {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: DecimalColumn;
}

interface TotalsRow {
  readonly subtotal: DecimalColumn;
  readonly igv: DecimalColumn;
  readonly total: DecimalColumn;
}

/** A line as its table columns, `position` keeping the entry order. */
interface LineData extends Omit<DocumentLine, 'unitPrice'> {
  readonly position: number;
  readonly unitPrice: string;
}

type TotalsData = Record<keyof DocumentTotals, string>;

/** Selection of the line tables, in the order they were entered. */
export const LINES_SELECT = {
  select: { productId: true, productName: true, sku: true, quantity: true, unitPrice: true },
  orderBy: { position: 'asc' },
} as const;

export const toLine = (row: LineRow): DocumentLine => ({
  productId: row.productId,
  productName: row.productName,
  sku: row.sku,
  quantity: row.quantity,
  unitPrice: amountOf(row.unitPrice),
});

export const linesData = (lines: readonly DocumentLine[]): LineData[] =>
  lines.map((line, index) => ({
    position: index + 1,
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: decimalOf(line.unitPrice),
  }));

export const totalsOfRow = (row: TotalsRow): DocumentTotals => ({
  subtotal: amountOf(row.subtotal),
  igv: amountOf(row.igv),
  total: amountOf(row.total),
});

export const totalsData = (totals: DocumentTotals): TotalsData => ({
  subtotal: decimalOf(totals.subtotal),
  igv: decimalOf(totals.igv),
  total: decimalOf(totals.total),
});
