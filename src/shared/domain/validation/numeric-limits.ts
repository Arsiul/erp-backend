/**
 * Column limits of the numeric fields. A value above them answers with the field message (422)
 * instead of a database overflow (500).
 */

/** Largest value of a `Decimal(14,2)` column: amounts, prices, costs and balances. */
export const MAX_AMOUNT = 999_999_999_999.99;

/** Largest value of an `Int` column: quantities, stock and days. */
export const MAX_INTEGER = 2_147_483_647;
