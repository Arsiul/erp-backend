import { formatCurrency } from './currency-format';

describe('formatCurrency', () => {
  it('formats soles like the frontend', () => {
    expect(formatCurrency(1234.5)).toMatch(/^S\/\s1,234\.50$/);
    expect(formatCurrency(0)).toMatch(/^S\/\s0\.00$/);
  });
});
