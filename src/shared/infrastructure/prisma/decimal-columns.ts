import { Money } from '../../domain/money/money';

/** A `Decimal(14,2)` column as Prisma reads it. */
export interface DecimalColumn {
  toString(): string;
}

/** A `Decimal(14,2)` column read by Prisma as domain money. */
export const moneyOf = (value: DecimalColumn): Money => Money.of(value.toString());

/** A `Decimal(14,2)` column as a plain amount. */
export const amountOf = (value: DecimalColumn): number => moneyOf(value).toNumber();

/** An amount written to a `Decimal(14,2)` column. */
export const decimalOf = (value: number): string => Money.of(value).toFixed();
