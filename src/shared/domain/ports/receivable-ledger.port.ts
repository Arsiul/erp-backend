import type { Money } from '../money/money';
import type { SettlementResult } from './settlement';

export const RECEIVABLE_LEDGER = Symbol('ReceivableLedger');

/**
 * Accounts receivable as seen by treasury. `applyPayment` throws BusinessError
 * «… no tiene saldo por cobrar.» / «El cobro supera el saldo de … (S/ …).».
 */
export interface ReceivableLedger {
  applyPayment(receivableId: string, amount: Money): Promise<SettlementResult>;
  revertPayment(receivableId: string, amount: Money): Promise<SettlementResult>;
}
