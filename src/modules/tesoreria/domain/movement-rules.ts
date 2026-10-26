import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money, round2 } from '../../../shared/domain/money/money';
import { MAX_AMOUNT } from '../../../shared/domain/validation/numeric-limits';
import { requireNumber } from '../../../shared/domain/validation/value-rules';
import { optionalText, pickEnum } from '../../../shared/domain/validation/field-rules';
import {
  MOVEMENT_CONCEPTS,
  MOVEMENT_TYPES,
  type MovementConcept,
  type MovementRecord,
  type MovementType,
  PAYMENT_METHODS,
  type PaymentMethod,
} from './treasury';

/** Raw body of `POST /movimientos`; the rules below check every value. */
export interface MovementInput {
  readonly date?: unknown;
  readonly accountId?: unknown;
  readonly type?: unknown;
  readonly concept?: unknown;
  readonly receivableId?: unknown;
  readonly payableId?: unknown;
  readonly counterparty?: unknown;
  readonly reference?: unknown;
  readonly method?: unknown;
  readonly amount?: unknown;
  readonly notes?: unknown;
}

export interface MovementHeader {
  readonly concept: MovementConcept;
  readonly amount: Money;
  readonly type: MovementType;
  readonly counterparty: string;
  readonly reference: string;
}

export const AMOUNT_TOO_LARGE = 'El importe supera el máximo permitido.';

/** Concept, amount, type and texts, checked in the same order as the form. */
export function movementHeader(input: MovementInput): MovementHeader {
  const concept = pickEnum(input.concept, MOVEMENT_CONCEPTS, 'Elige el concepto.');
  const amount = round2(requireNumber(input.amount, 'Escribe el importe.'));
  if (amount <= 0) {
    throw new BusinessError('El importe debe ser mayor que cero.');
  }
  if (amount > MAX_AMOUNT) {
    throw new BusinessError(AMOUNT_TOO_LARGE);
  }
  return {
    concept,
    amount: Money.of(amount),
    type: pickEnum(input.type, MOVEMENT_TYPES, 'Elige si es ingreso o egreso.', 'income'),
    counterparty: optionalText(input.counterparty),
    reference: optionalText(input.reference),
  };
}

export const paymentMethod = (value: unknown): PaymentMethod =>
  pickEnum(value, PAYMENT_METHODS, 'Elige el medio de pago.', 'transfer');

/** Amount, account and document already moved balances: to change them, void and register again. */
export function assertEditable(movement: MovementRecord): void {
  if (movement.status !== 'posted') {
    throw new BusinessError('El movimiento está anulado.');
  }
}

export function assertVoidable(movement: MovementRecord): void {
  if (movement.status !== 'posted') {
    throw new BusinessError('El movimiento ya está anulado.');
  }
}
