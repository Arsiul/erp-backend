import { BusinessError } from '../errors/domain-error';
import { isIsoDay } from '../time/lima-time';
import { optionalText } from './field-rules';

/** Same coercion as the forms: numeric strings are accepted, anything else is rejected. */
export function requireNumber(value: unknown, message: string, min = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new BusinessError(message);
  }
  return number;
}

/** A `YYYY-MM-DD` day; empty values take `fallback`. */
export function requireDate(value: unknown, fallback: string): string {
  const text = optionalText(value);
  if (!text) {
    return fallback;
  }
  if (!isIsoDay(text)) {
    throw new BusinessError('La fecha no es válida.');
  }
  return text;
}

/** A request id as text; anything else reads as missing. */
export const idText = (value: unknown): string => (typeof value === 'string' ? value : '');
