import { BusinessError } from '../errors/domain-error';
import { assertPasswordPolicy } from './password-policy';

describe('assertPasswordPolicy', () => {
  it('accepts passwords between 8 and 128 characters', () => {
    expect(assertPasswordPolicy('12345678')).toBe('12345678');
  });

  it('rejects short, long or missing passwords', () => {
    expect(() => assertPasswordPolicy('1234567')).toThrow(
      new BusinessError('La contraseña debe tener al menos 8 caracteres.'),
    );
    expect(() => assertPasswordPolicy(undefined)).toThrow(BusinessError);
    expect(() => assertPasswordPolicy('x'.repeat(129))).toThrow(
      new BusinessError('La contraseña no puede tener más de 128 caracteres.'),
    );
  });
});
