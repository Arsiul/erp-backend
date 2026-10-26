import Decimal from 'decimal.js';
import { MAX_AMOUNT } from '../validation/numeric-limits';
import { computeTotals, TOTAL_TOO_LARGE, totalsFromSubtotal } from './igv';
import { Money } from './money';

const IGV_RATE = 0.18;

const asNumbers = (totals: ReturnType<typeof totalsFromSubtotal>) => ({
  subtotal: totals.subtotal.toNumber(),
  igv: totals.igv.toNumber(),
  total: totals.total.toNumber(),
});

describe('computeTotals', () => {
  it('returns zeros for an empty document', () => {
    expect(asNumbers(computeTotals([], IGV_RATE))).toEqual({ subtotal: 0, igv: 0, total: 0 });
  });

  it('rounds only the subtotal, not each line', () => {
    const lines = [
      { quantity: 3, unitPrice: 0.335 },
      { quantity: 1, unitPrice: '0.335' },
    ];
    // 4 x 0.335 = 1.34 exactly; rounding each line first would give 1.01 + 0.34 = 1.35.
    expect(asNumbers(computeTotals(lines, IGV_RATE))).toEqual({
      subtotal: 1.34,
      igv: 0.24,
      total: 1.58,
    });
  });

  it('accepts Money and Decimal unit prices', () => {
    const lines = [
      { quantity: 2, unitPrice: Money.of(50) },
      { quantity: 1, unitPrice: new Decimal('100') },
    ];
    expect(asNumbers(computeTotals(lines, '0.18'))).toEqual({
      subtotal: 200,
      igv: 36,
      total: 236,
    });
  });
});

describe('totalsFromSubtotal', () => {
  it('derives igv and total from a stored subtotal', () => {
    expect(asNumbers(totalsFromSubtotal(84.75, new Decimal(IGV_RATE)))).toEqual({
      subtotal: 84.75,
      igv: 15.26,
      total: 100.01,
    });
  });

  it('rejects a total above the amount column limit', () => {
    expect(totalsFromSubtotal(MAX_AMOUNT, 0).total.toNumber()).toBe(MAX_AMOUNT);
    expect(() => totalsFromSubtotal(MAX_AMOUNT, IGV_RATE)).toThrow(TOTAL_TOO_LARGE);
    expect(() => computeTotals([{ quantity: 2_000_000, unitPrice: 1_000_000 }], IGV_RATE)).toThrow(
      TOTAL_TOO_LARGE,
    );
  });

  it('handles negative subtotals for credit notes', () => {
    expect(asNumbers(totalsFromSubtotal(Money.of(-10), IGV_RATE))).toEqual({
      subtotal: -10,
      igv: -1.8,
      total: -11.8,
    });
  });
});
