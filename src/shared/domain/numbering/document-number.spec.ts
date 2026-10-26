import { documentNumber, formatCode } from './document-number';

describe('document numbers', () => {
  it('pads the counter to five digits after the prefix', () => {
    expect(documentNumber('OC-', 7)).toBe('OC-00007');
    expect(documentNumber('VTA-', 123456)).toBe('VTA-123456');
  });

  it('pads a code to the requested digits', () => {
    expect(formatCode('CAT', 3, 3)).toBe('CAT003');
    expect(formatCode('F001-', 42, 8)).toBe('F001-00000042');
  });
});
