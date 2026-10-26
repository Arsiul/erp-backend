import { amountOf, decimalOf, moneyOf } from './decimal-columns';

describe('decimal-columns', () => {
  it('reads a decimal column as money or as a plain amount', () => {
    const column = { toString: () => '12.50' };
    expect(moneyOf(column).toFixed()).toBe('12.50');
    expect(amountOf(column)).toBe(12.5);
  });

  it('writes an amount with two decimals', () => {
    expect(decimalOf(7)).toBe('7.00');
    expect(decimalOf(10.126)).toBe('10.13');
  });
});
