import Decimal from 'decimal.js';

const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = number | string | Money | Decimal;

/** Rounds to 2 decimals with HALF_UP, the backend equivalent of the frontend `round2`. */
export function round2(value: number | string | Decimal): number {
  return new MoneyDecimal(value).toDecimalPlaces(2).toNumber();
}

/** Immutable monetary amount in soles, always kept at 2 decimals (HALF_UP). */
export class Money {
  private constructor(private readonly amount: Decimal) {}

  static of(value: MoneyInput): Money {
    const raw = value instanceof Money ? value.amount : value;
    return new Money(new MoneyDecimal(raw).toDecimalPlaces(2));
  }

  static zero(): Money {
    return new Money(new MoneyDecimal(0));
  }

  static sum(values: readonly Money[]): Money {
    return values.reduce((total, value) => total.plus(value), Money.zero());
  }

  plus(other: MoneyInput): Money {
    return Money.of(this.amount.plus(Money.of(other).amount));
  }

  minus(other: MoneyInput): Money {
    return Money.of(this.amount.minus(Money.of(other).amount));
  }

  /** Multiplies by a factor (quantity, rate) and rounds the result to 2 decimals. */
  times(factor: number | string | Decimal): Money {
    return Money.of(this.amount.times(new MoneyDecimal(factor)));
  }

  negated(): Money {
    return new Money(this.amount.negated());
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  compare(other: MoneyInput): -1 | 0 | 1 {
    const result = this.amount.comparedTo(Money.of(other).amount);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }

  equals(other: MoneyInput): boolean {
    return this.compare(other) === 0;
  }

  lessThan(other: MoneyInput): boolean {
    return this.compare(other) < 0;
  }

  greaterThan(other: MoneyInput): boolean {
    return this.compare(other) > 0;
  }

  toNumber(): number {
    return this.amount.toNumber();
  }

  /** Always 2 decimals, e.g. `S/ ${money.toFixed()}`. */
  toFixed(): string {
    return this.amount.toFixed(2);
  }

  toDecimal(): Decimal {
    return this.amount;
  }

  toJSON(): number {
    return this.toNumber();
  }

  toString(): string {
    return this.toFixed();
  }
}
