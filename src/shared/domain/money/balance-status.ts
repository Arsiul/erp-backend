import { Money, type MoneyInput } from './money';

export type BalanceStatus = 'pending' | 'partial' | 'paid';

/** Status of a receivable or payable from its original amount and its remaining balance. */
export function balanceStatus(amount: MoneyInput, balance: MoneyInput): BalanceStatus {
  const remaining = Money.of(balance);
  if (!remaining.isPositive()) {
    return 'paid';
  }
  return remaining.lessThan(amount) ? 'partial' : 'pending';
}
