import { MAX_INTEGER } from '../../../shared/domain/validation/numeric-limits';
import { minStockValue, positiveUnits } from './inventory-fields';

describe('inventory fields', () => {
  it('reads positive whole units up to the integer limit', () => {
    expect(positiveUnits('3')).toBe(3);
    expect(positiveUnits(MAX_INTEGER)).toBe(MAX_INTEGER);
  });

  it.each([0, -1, 1.5, 'abc', MAX_INTEGER + 1, 1e20])('rejects the units %p', (value) => {
    expect(() => positiveUnits(value)).toThrow('La cantidad debe ser un entero mayor que cero.');
  });

  it('reads a minimum stock from 0 up to the integer limit', () => {
    expect(minStockValue(0)).toBe(0);
    expect(minStockValue('7')).toBe(7);
    expect(minStockValue(MAX_INTEGER)).toBe(MAX_INTEGER);
  });

  it.each([-1, -0.5, 2.5, 'abc', MAX_INTEGER + 1, 1e20])(
    'rejects the minimum stock %p',
    (value) => {
      expect(() => minStockValue(value)).toThrow('El stock mínimo debe ser un entero desde 0.');
    },
  );
});
