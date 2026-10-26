import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { balanceStatus, type BalanceStatus } from '../../../shared/domain/money/balance-status';
import { Money } from '../../../shared/domain/money/money';

export type PayableStatus = BalanceStatus | 'cancelled';

/** What a payment needs to know about the payable it settles. */
export interface PayableBalance {
  readonly documentNumber: string;
  readonly amount: Money;
  readonly paidAmount: Money;
  readonly balance: Money;
  readonly status: PayableStatus;
}

export interface SettledPayable {
  readonly paidAmount: Money;
  readonly balance: Money;
  readonly status: BalanceStatus;
}

/**
 * A payment from treasury: the payable has to be open and the payment cannot exceed its balance.
 */
export function applyPaymentTo(payable: PayableBalance, amount: Money): SettledPayable {
  if (payable.status === 'cancelled' || !payable.balance.isPositive()) {
    throw new BusinessError(`${payable.documentNumber} no tiene saldo por pagar.`);
  }
  if (amount.greaterThan(payable.balance)) {
    throw new BusinessError(
      `El pago supera el saldo de ${payable.documentNumber} (S/ ${payable.balance.toFixed()}).`,
    );
  }
  return settle(payable, payable.paidAmount.plus(amount), payable.balance.minus(amount));
}

/** Voiding a payment gives its amount back to the payable; it never fails. */
export function revertPaymentFrom(payable: PayableBalance, amount: Money): SettledPayable {
  return settle(payable, payable.paidAmount.minus(amount), payable.balance.plus(amount));
}

function settle(payable: PayableBalance, paidAmount: Money, balance: Money): SettledPayable {
  return { paidAmount, balance, status: balanceStatus(payable.amount, balance) };
}
