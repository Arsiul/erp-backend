import type { Money } from '../money/money';

export const BANK_LEDGER = Symbol('BankLedger');

/**
 * Bank account balances. `apply` adds a signed delta and returns the new balance; it throws
 * BusinessError «… no tiene saldo suficiente (S/ …).» when the balance would go below zero.
 */
export interface BankLedger {
  apply(accountId: string, delta: Money): Promise<Money>;
}
