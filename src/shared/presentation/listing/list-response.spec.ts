import type { Response } from 'express';
import { listBody, TOTAL_COUNT_HEADER } from './list-response';

const response = (): { res: Response; headers: Map<string, string> } => {
  const headers = new Map<string, string>();
  const res = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  } as unknown as Response;
  return { res, headers };
};

describe('listBody', () => {
  it('sends the total of a paged request', () => {
    const { res, headers } = response();
    expect(listBody(res, { items: ['a'], total: 3, paged: true })).toEqual(['a']);
    expect(headers.get(TOTAL_COUNT_HEADER)).toBe('3');
  });

  it('sends no total for a complete unpaged list', () => {
    const { res, headers } = response();
    expect(listBody(res, { items: ['a', 'b'], total: 2, paged: false })).toEqual(['a', 'b']);
    expect(headers.has(TOTAL_COUNT_HEADER)).toBe(false);
  });

  it('sends the total when an unpaged list was cut at the limit', () => {
    const { res, headers } = response();
    listBody(res, { items: ['a'], total: 5_001, paged: false });
    expect(headers.get(TOTAL_COUNT_HEADER)).toBe('5001');
  });
});
