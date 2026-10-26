import { plural } from './plural';

describe('plural', () => {
  it('pluralizes by count', () => {
    expect(plural(1, 'venta', 'ventas')).toBe('1 venta');
    expect(plural(0, 'venta', 'ventas')).toBe('0 ventas');
    expect(plural(3, 'venta', 'ventas')).toBe('3 ventas');
  });
});
