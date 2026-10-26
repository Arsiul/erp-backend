import { balanceStatus } from './balance-status';
import { Money } from './money';

describe('balanceStatus', () => {
  it.each([
    [100, 100, 'pending'],
    [100, 40, 'partial'],
    [100, 0, 'paid'],
    [100, -0.004, 'paid'],
    [100, 0.004, 'paid'],
    [Money.of(100), Money.of(99.99), 'partial'],
  ])('amount %p with balance %p is %p', (amount, balance, expected) => {
    expect(balanceStatus(amount, balance)).toBe(expected);
  });
});
