import Decimal from 'decimal.js';
import { BusinessError } from '../errors/domain-error';
import { MAX_AMOUNT } from '../validation/numeric-limits';
import { Money } from './money';

export interface PricedLine {
  readonly quantity: number;
  readonly unitPrice: number | string | Decimal | Money;
}

export interface Totals {
  readonly subtotal: Money;
  readonly igv: Money;
  readonly total: Money;
}

const unitPriceOf = (line: PricedLine): Decimal =>
  line.unitPrice instanceof Money ? line.unitPrice.toDecimal() : new Decimal(line.unitPrice);

/** subtotal = round2(sum of quantity x unitPrice); lines are not rounded individually. */
export function computeTotals(
  lines: readonly PricedLine[],
  igvRate: number | string | Decimal,
): Totals {
  const rawSubtotal = lines.reduce(
    (sum, line) => sum.plus(unitPriceOf(line).times(line.quantity)),
    new Decimal(0),
  );
  return totalsFromSubtotal(Money.of(rawSubtotal), igvRate);
}

export const TOTAL_TOO_LARGE = 'El total del documento supera el máximo permitido.';

/**
 * igv = round2(subtotal x rate); total = round2(subtotal + igv). A total above the amount column
 * limit is rejected, since the subtotal and the IGV are below it.
 */
export function totalsFromSubtotal(
  subtotal: number | string | Decimal | Money,
  igvRate: number | string | Decimal,
): Totals {
  const base = Money.of(subtotal);
  const igv = base.times(igvRate);
  const total = base.plus(igv);
  if (total.greaterThan(MAX_AMOUNT)) {
    throw new BusinessError(TOTAL_TOO_LARGE);
  }
  return { subtotal: base, igv, total };
}
