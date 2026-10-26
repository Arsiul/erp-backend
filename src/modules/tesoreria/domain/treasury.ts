import type { Money } from '../../../shared/domain/money/money';

export const MOVEMENT_TYPES = ['income', 'expense'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_CONCEPTS = ['collection', 'payment', 'other'] as const;
export type MovementConcept = (typeof MOVEMENT_CONCEPTS)[number];

export const PAYMENT_METHODS = ['transfer', 'deposit', 'cash', 'check', 'wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MOVEMENT_STATUSES = ['posted', 'voided'] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export interface MovementValues {
  readonly date: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly type: MovementType;
  readonly concept: MovementConcept;
  readonly receivableId: string | null;
  readonly payableId: string | null;
  readonly counterparty: string;
  readonly reference: string;
  readonly method: PaymentMethod;
  readonly amount: Money;
  readonly status: MovementStatus;
  readonly notes: string;
}

export interface MovementRecord extends MovementValues {
  readonly id: string;
  readonly number: string;
}

/** JSON of `/movimientos`: the frontend expects '' instead of null document links. */
export type MovementView = Omit<MovementRecord, 'amount' | 'receivableId' | 'payableId'> & {
  readonly amount: number;
  readonly receivableId: string;
  readonly payableId: string;
};

export const toMovementView = (record: MovementRecord): MovementView => ({
  ...record,
  amount: record.amount.toNumber(),
  receivableId: record.receivableId ?? '',
  payableId: record.payableId ?? '',
});

/** Signed effect of the movement on its bank account. */
export const balanceDelta = (type: MovementType, amount: Money): Money =>
  type === 'income' ? amount : amount.negated();
