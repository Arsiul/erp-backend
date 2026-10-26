import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { round2 } from '../../../shared/domain/money/money';
import { requireActive, requireFound } from '../../../shared/domain/validation/record-rules';
import { MAX_AMOUNT, MAX_INTEGER } from '../../../shared/domain/validation/numeric-limits';
import { requireNumber } from '../../../shared/domain/validation/value-rules';
import {
  type ActiveStatus,
  EMAIL_PATTERN,
  optionalText,
} from '../../../shared/domain/validation/field-rules';

/**
 * Field rules of the master data, identical to the helpers of the frontend mock
 * (`optionalEmail`, `validRuc`, `customerDocument`, `requireNumber`, `wholeNumber`).
 * The column limits (`numeric-limits`) answer with the field message instead of a database error.
 */

export function optionalEmail(value: unknown): string {
  const email = optionalText(value).toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new BusinessError('El correo no es válido.');
  }
  return email;
}

export function validRuc(value: unknown): string {
  const ruc = optionalText(value);
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) {
    throw new BusinessError('El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.');
  }
  return ruc;
}

export const CUSTOMER_DOCUMENT_TYPES = ['RUC', 'DNI', 'CE'] as const;

export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number];

export function customerDocument(type: CustomerDocumentType, value: unknown): string {
  const number = optionalText(value).toUpperCase();
  if (type === 'RUC') {
    return validRuc(number);
  }
  if (type === 'DNI' && !/^\d{8}$/.test(number)) {
    throw new BusinessError('El DNI debe tener 8 dígitos.');
  }
  if (type === 'CE' && !/^[A-Z0-9]{9,12}$/.test(number)) {
    throw new BusinessError('El carné de extranjería debe tener de 9 a 12 caracteres.');
  }
  return number;
}

/** A Decimal(14,2) amount, rounded HALF_UP to 2 decimals. */
export function moneyAmount(value: unknown, message: string): number {
  const number = requireNumber(value, message);
  if (number > MAX_AMOUNT) {
    throw new BusinessError(message);
  }
  return round2(number);
}

export function wholeNumber(value: unknown, message: string): number {
  const number = requireNumber(value ?? 0, message);
  if (!Number.isInteger(number) || number > MAX_INTEGER) {
    throw new BusinessError(message);
  }
  return number;
}

/** Id sent by a form for a reference; anything but a non-empty string means «not chosen». */
export const referenceId = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** `requireRecord` of the mock, plus `requireActive` when `mustBeActive` is set. */
export function requireReference<T extends { readonly status: ActiveStatus }>(
  record: T | null,
  label: string,
  mustBeActive: boolean,
): T {
  return mustBeActive ? requireActive(record, label) : requireFound(record, label);
}
