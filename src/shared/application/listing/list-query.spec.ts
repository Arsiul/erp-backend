import { optionalId } from './list-query';

describe('optionalId', () => {
  it('trims the id and drops an empty filter', () => {
    expect(optionalId(' c1 ')).toBe('c1');
    expect(optionalId('   ')).toBeUndefined();
    expect(optionalId(undefined)).toBeUndefined();
  });
});
