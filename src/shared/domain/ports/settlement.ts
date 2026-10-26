import type { Money } from '../money/money';
import type { BalanceStatus } from '../money/balance-status';

/** Result of applying or reverting a payment on a receivable or payable. */
export interface SettlementResult {
  readonly documentNumber: string;
  readonly counterpartyName: string;
  readonly balance: Money;
  readonly status: BalanceStatus;
}
