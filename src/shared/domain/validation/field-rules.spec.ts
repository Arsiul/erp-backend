import { BusinessError } from '../errors/domain-error';
import {
  activeStatus,
  assertCanSetStatus,
  optionalText,
  pickEnum,
  requireText,
  sameText,
} from './field-rules';

describe('field rules', () => {
  it('requires trimmed text', () => {
    expect(requireText('  Ana ', 'Escribe el nombre.')).toBe('Ana');
    expect(() => requireText('   ', 'Escribe el nombre.')).toThrow(
      new BusinessError('Escribe el nombre.'),
    );
    expect(() => requireText(3, 'Escribe el nombre.')).toThrow(BusinessError);
  });

  it('trims optional text and ignores other types', () => {
    expect(optionalText(' x ')).toBe('x');
    expect(optionalText(undefined)).toBe('');
  });

  it('picks enum values with an optional fallback', () => {
    expect(pickEnum('b', ['a', 'b'], 'Mal.')).toBe('b');
    expect(pickEnum('', ['a', 'b'], 'Mal.', 'a')).toBe('a');
    expect(pickEnum(undefined, ['a', 'b'], 'Mal.', 'a')).toBe('a');
    expect(() => pickEnum(undefined, ['a', 'b'], 'Mal.')).toThrow(new BusinessError('Mal.'));
    expect(() => pickEnum('c', ['a', 'b'], 'Mal.', 'a')).toThrow(new BusinessError('Mal.'));
  });

  it('defaults the status to active', () => {
    expect(activeStatus(undefined)).toBe('active');
    expect(activeStatus('inactive')).toBe('inactive');
    expect(() => activeStatus('archived')).toThrow(new BusinessError('El estado no es válido.'));
  });

  it('rejects a status change that changes nothing', () => {
    expect(() => {
      assertCanSetStatus('active', 'inactive');
    }).not.toThrow();
    expect(() => {
      assertCanSetStatus('active', 'active');
    }).toThrow(new BusinessError('El registro ya está activo.'));
    expect(() => {
      assertCanSetStatus('inactive', 'inactive');
    }).toThrow(new BusinessError('El registro ya está inactivo.'));
  });

  it('compares text ignoring case and outer spaces', () => {
    expect(sameText(' Ventas', 'ventas ')).toBe(true);
    expect(sameText('Ventas', 'Compras')).toBe(false);
  });
});
