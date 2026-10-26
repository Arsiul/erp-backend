export type DomainErrorKind =
  'business' | 'not-found' | 'conflict' | 'forbidden' | 'unauthorized' | 'operation-not-allowed';

/**
 * Base class for every expected failure. `message` is shown to the end user verbatim,
 * so it must be written in Spanish and match the frontend mock literally.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  protected constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A business rule was violated (HTTP 422). */
export class BusinessError extends DomainError {
  readonly kind = 'business';

  constructor(message: string, code = 'BUSINESS_RULE') {
    super(message, code);
  }
}

/** The requested record does not exist (HTTP 404). */
export class NotFoundError extends DomainError {
  readonly kind = 'not-found';

  constructor(message = 'El registro ya no existe.', code = 'NOT_FOUND') {
    super(message, code);
  }
}

/** A uniqueness or concurrency conflict (HTTP 409). */
export class ConflictError extends DomainError {
  readonly kind = 'conflict';

  constructor(message: string, code = 'CONFLICT') {
    super(message, code);
  }
}

/** The authenticated user lacks permission (HTTP 403). */
export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';

  constructor(message = 'Tu rol no tiene acceso a este módulo.', code = 'FORBIDDEN') {
    super(message, code);
  }
}

/** There is no valid session (HTTP 401). */
export class UnauthorizedError extends DomainError {
  readonly kind = 'unauthorized';

  constructor(message = 'Tu sesión terminó. Vuelve a iniciar sesión.', code = 'UNAUTHORIZED') {
    super(message, code);
  }
}

/** The resource does not support the requested operation (HTTP 405). */
export class OperationNotAllowedError extends DomainError {
  readonly kind = 'operation-not-allowed';

  constructor(message: string, code = 'OPERATION_NOT_ALLOWED') {
    super(message, code);
  }
}
