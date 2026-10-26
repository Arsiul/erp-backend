const currency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "S/ 1,234.50", like `formatCurrency` of the frontend. */
export const formatCurrency = (value: number): string => currency.format(value);
