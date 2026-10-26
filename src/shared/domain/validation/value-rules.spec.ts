import { idText, requireDate, requireNumber } from './value-rules';

describe('value rules', () => {
  it('reads a finite number not below the minimum', () => {
    expect(requireNumber('12.5', 'Monto inválido.')).toBe(12.5);
    expect(requireNumber(0, 'Monto inválido.')).toBe(0);
    expect(requireNumber(3, 'Monto inválido.', 1)).toBe(3);
  });

  it.each([-1, 'abc', Number.POSITIVE_INFINITY, undefined, {}])(
    'rejects the number %p',
    (value) => {
      expect(() => requireNumber(value, 'Monto inválido.')).toThrow('Monto inválido.');
    },
  );

  it('applies a custom minimum', () => {
    expect(() => requireNumber(0, 'Debe ser positivo.', 1)).toThrow('Debe ser positivo.');
  });

  it('takes the fallback day when the date is empty', () => {
    expect(requireDate(undefined, '2026-10-25')).toBe('2026-10-25');
    expect(requireDate('   ', '2026-10-25')).toBe('2026-10-25');
    expect(requireDate(' 2026-01-31 ', '2026-10-25')).toBe('2026-01-31');
  });

  it.each(['2026-02-30', '25/10/2026', 'mañana'])('rejects the date %p', (value) => {
    expect(() => requireDate(value, '2026-10-25')).toThrow('La fecha no es válida.');
  });

  it('keeps only text ids', () => {
    expect(idText('c1')).toBe('c1');
    expect(idText(7)).toBe('');
    expect(idText(null)).toBe('');
  });
});
