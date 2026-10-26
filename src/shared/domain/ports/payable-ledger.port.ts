import type { Money } from '../money/money';
import type { SettlementResult } from './settlement';

export const PAYABLE_LEDGER = Symbol('PayableLedger');

/**
 * Accounts payable as seen by treasury. `applyPayment` throws BusinessError
 * «… no tiene saldo por pagar.» / «El pago supera el saldo de … (S/ …).».
 */
export interface PayableLedger {
  applyPayment(payableId: string, amount: Money): Promise<SettlementResult>;
  revertPayment(payableId: string, amount: Money): Promise<SettlementResult>;
}
