import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation-exception.factory';

const error = (
  fields: Pick<ValidationError, 'property'> & Partial<ValidationError>,
): ValidationError => Object.assign(new ValidationError(), { children: [] }, fields);

const messageOf = (errors: ValidationError[]): unknown => {
  const exception = validationExceptionFactory(errors);
  expect(exception).toBeInstanceOf(BadRequestException);
  return (exception.getResponse() as { message: unknown }).message;
};

describe('validationExceptionFactory', () => {
  it('reports only the first failing constraint', () => {
    const errors = [
      error({
        property: 'ruc',
        constraints: { isNotEmpty: 'El RUC es obligatorio.', length: 'x' },
      }),
      error({ property: 'name', constraints: { isString: 'El nombre debe ser texto.' } }),
    ];
    expect(messageOf(errors)).toBe('El RUC es obligatorio.');
  });

  it('explains non-whitelisted properties in Spanish', () => {
    const errors = [
      error({
        property: 'isAdmin',
        constraints: { whitelistValidation: 'property should not exist' },
      }),
    ];
    expect(messageOf(errors)).toBe('El campo isAdmin no está permitido.');
  });

  it('looks into nested children', () => {
    const errors = [
      error({ property: 'items', children: [error({ property: '0' })] }),
      error({
        property: 'lines',
        children: [
          error({
            property: '0',
            children: [error({ property: 'qty', constraints: { min: 'Cantidad mínima 1.' } })],
          }),
        ],
      }),
    ];
    expect(messageOf(errors)).toBe('Cantidad mínima 1.');
  });

  it('uses a default message when nothing is readable', () => {
    expect(messageOf([Object.assign(new ValidationError(), { property: 'bare' })])).toBe(
      'Los datos enviados no son válidos.',
    );
    expect(messageOf([])).toBe('Los datos enviados no son válidos.');
  });
});
