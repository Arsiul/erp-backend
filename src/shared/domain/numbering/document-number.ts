/** `nextNumber` of the frontend mocks: `CLI-0001`, `CAT-001`, `ALM-01`. */
export const formatCode = (prefix: string, value: number, digits: number): string =>
  `${prefix}${String(value).padStart(digits, '0')}`;

/** `OC-00001`: the prefix (with its dash) and the counter padded to five digits. */
export const documentNumber = (prefix: string, counter: number): string =>
  formatCode(prefix, counter, 5);
