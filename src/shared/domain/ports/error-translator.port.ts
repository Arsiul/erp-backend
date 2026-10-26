import type { DomainError } from '../errors/domain-error';

export const ERROR_TRANSLATOR = Symbol('ErrorTranslator');

/**
 * Recognises the failures raised by an adapter (the database, for instance) that have a meaning
 * for the user, so presentation can answer them without knowing the adapter.
 */
export interface ErrorTranslator {
  /** The domain error `error` stands for, or `undefined` when it is unexpected. */
  translate(error: unknown): DomainError | undefined;
}
