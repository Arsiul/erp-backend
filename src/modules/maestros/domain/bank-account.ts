import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  requireText,
} from '../../../shared/domain/validation/field-rules';
import { moneyAmount } from './master-fields';

export const ACCOUNT_NUMBER_TAKEN = 'Esa cuenta ya está registrada.';
export const BANK_ACCOUNT_IN_USE =
  'La cuenta tiene movimientos; desactívala en lugar de eliminarla.';

/** Fields a form may change; the balance only moves with treasury movements. */
export interface BankAccountChanges {
  readonly bank: string;
  readonly name: string;
  readonly accountNumber: string;
  readonly status: ActiveStatus;
}

export interface BankAccountValues extends BankAccountChanges {
  readonly openingBalance: number;
  readonly balance: number;
}

/** The shape of `BankAccount` in the frontend. */
export interface BankAccountRecord extends BankAccountValues {
  readonly id: string;
}

export type BankAccountInput = { readonly [K in keyof BankAccountValues]?: unknown };

export interface BankAccountLookups {
  isAccountNumberTaken(accountNumber: string, exceptId?: string): Promise<boolean>;
}

async function uniqueAccountNumber(
  value: unknown,
  lookups: BankAccountLookups,
  exceptId?: string,
): Promise<string> {
  const accountNumber = requireText(value, 'Escribe el número de cuenta.');
  if (await lookups.isAccountNumberTaken(accountNumber, exceptId)) {
    throw new BusinessError(ACCOUNT_NUMBER_TAKEN);
  }
  return accountNumber;
}

export async function bankAccountValues(
  input: BankAccountInput,
  lookups: BankAccountLookups,
): Promise<BankAccountValues> {
  const accountNumber = await uniqueAccountNumber(input.accountNumber, lookups);
  const openingBalance = moneyAmount(
    input.openingBalance ?? 0,
    'El saldo inicial no puede ser negativo.',
  );
  return {
    bank: requireText(input.bank, 'Escribe el banco.'),
    name: requireText(input.name, 'Escribe un nombre para la cuenta.'),
    accountNumber,
    openingBalance,
    balance: openingBalance,
    status: activeStatus(input.status),
  };
}

/** The opening balance and the balance stay as they are; other fields fall back to `current`. */
export async function bankAccountChanges(
  current: BankAccountRecord,
  input: BankAccountInput,
  lookups: BankAccountLookups,
): Promise<BankAccountChanges> {
  const accountNumber = await uniqueAccountNumber(
    input.accountNumber ?? current.accountNumber,
    lookups,
    current.id,
  );
  return {
    bank: requireText(input.bank ?? current.bank, 'Escribe el banco.'),
    name: requireText(input.name ?? current.name, 'Escribe un nombre para la cuenta.'),
    accountNumber,
    status: activeStatus(input.status ?? current.status),
  };
}
