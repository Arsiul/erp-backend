import {
  BusinessError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  OperationNotAllowedError,
  UnauthorizedError,
} from './domain-error';

describe('DomainError hierarchy', () => {
  it.each([
    [new BusinessError('Stock insuficiente.'), 'business', 'BUSINESS_RULE', 'Stock insuficiente.'],
    [new NotFoundError(), 'not-found', 'NOT_FOUND', 'El registro ya no existe.'],
    [new ConflictError('Duplicado.'), 'conflict', 'CONFLICT', 'Duplicado.'],
    [new ForbiddenError(), 'forbidden', 'FORBIDDEN', 'Tu rol no tiene acceso a este módulo.'],
    [
      new UnauthorizedError(),
      'unauthorized',
      'UNAUTHORIZED',
      'Tu sesión terminó. Vuelve a iniciar sesión.',
    ],
    [
      new OperationNotAllowedError('No se puede anular.'),
      'operation-not-allowed',
      'OPERATION_NOT_ALLOWED',
      'No se puede anular.',
    ],
  ])('%s exposes kind, default code and message', (error, kind, code, message) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(kind);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe(error.constructor.name);
  });

  it('accepts a custom code', () => {
    const error = new BusinessError('Saldo insuficiente.', 'INSUFFICIENT_BALANCE');
    expect(error.code).toBe('INSUFFICIENT_BALANCE');
  });
});
