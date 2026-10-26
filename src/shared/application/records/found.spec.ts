import { NotFoundError } from '../../domain/errors/domain-error';
import { found } from './found';

describe('found', () => {
  it('returns the record or throws a not found error', () => {
    const record = { id: 'r1' };
    expect(found(record)).toBe(record);
    expect(() => found(null)).toThrow(NotFoundError);
  });
});
