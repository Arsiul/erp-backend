/** "1 venta", "3 ventas": the count followed by the form of the noun that agrees with it. */
export const plural = (count: number, singular: string, pluralForm: string): string =>
  `${String(count)} ${count === 1 ? singular : pluralForm}`;
