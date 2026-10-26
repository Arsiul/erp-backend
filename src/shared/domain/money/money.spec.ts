import Decimal from 'decimal.js';
import { Money, round2 } from './money';

describe('round2', () => {
  it.each([
    [1.005, 1.01],
    [2.675, 2.68],
    [0.125, 0.13],
    [-1.005, -1.01],
    ['10.004', 10],
    [new Decimal('3.335'), 3.34],
  ])('rounds %p HALF_UP to %p', (input, expected) => {
    expect(round2(input)).toBe(expected);
  });
});

describe('Money', () => {
  it('normalizes to 2 decimals on creation', () => {
    expect(Money.of(10.005).toFixed()).toBe('10.01');
    expect(Money.of('7').toFixed()).toBe('7.00');
    expect(Money.of(new Decimal('1.234')).toNumber()).toBe(1.23);
    expect(Money.of(Money.of(5)).toNumber()).toBe(5);
  });

  it('avoids binary floating point drift', () => {
    expect(Money.of(0.1).plus(0.2).toNumber()).toBe(0.3);
    expect(Money.of(1).minus(0.9).toNumber()).toBe(0.1);
  });

  it('sums a list and starts from zero', () => {
    expect(Money.sum([]).isZero()).toBe(true);
    expect(Money.sum([Money.of(1.1), Money.of(2.2), Money.of(3.3)]).toNumber()).toBe(6.6);
    expect(Money.zero().toFixed()).toBe('0.00');
  });

  it('multiplies and rounds the product', () => {
    expect(Money.of(100).times(0.18).toNumber()).toBe(18);
    expect(Money.of(10.55).times('0.18').toNumber()).toBe(1.9);
    expect(Money.of(3).times(new Decimal('1.5')).toNumber()).toBe(4.5);
  });

  it('negates', () => {
    expect(Money.of(5).negated().toNumber()).toBe(-5);
    expect(Money.of(-5).negated().toNumber()).toBe(5);
  });

  it('reports its sign', () => {
    expect(Money.of(0).isZero()).toBe(true);
    expect(Money.of(0).isPositive()).toBe(false);
    expect(Money.of(0).isNegative()).toBe(false);
    expect(Money.of(0).negated().isNegative()).toBe(false);
    expect(Money.of(1).isPositive()).toBe(true);
    expect(Money.of(-1).isNegative()).toBe(true);
  });

  it('compares amounts', () => {
    const ten = Money.of(10);
    expect(ten.compare(5)).toBe(1);
    expect(ten.compare('10.00')).toBe(0);
    expect(ten.compare(Money.of(20))).toBe(-1);
    expect(ten.equals(10.001)).toBe(true);
    expect(ten.lessThan(11)).toBe(true);
    expect(ten.lessThan(10)).toBe(false);
    expect(ten.greaterThan(9.99)).toBe(true);
    expect(ten.greaterThan(10)).toBe(false);
  });

  it('serializes as a number and prints with 2 decimals', () => {
    const amount = Money.of(1234.5);
    expect(JSON.stringify({ amount })).toBe('{"amount":1234.5}');
    expect(amount.toString()).toBe('1234.50');
    expect(amount.toDecimal().equals(new Decimal('1234.5'))).toBe(true);
  });
});
