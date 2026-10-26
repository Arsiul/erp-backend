import {
  DEFAULT_PAGE_SIZE,
  listOffset,
  MAX_PAGE_SIZE,
  normalizePageRequest,
  toOffset,
  toPage,
  UNPAGED_LIST_LIMIT,
} from './pagination';

describe('listOffset', () => {
  it('caps a list requested without page at the unpaged limit', () => {
    expect(listOffset()).toEqual({ skip: 0, take: UNPAGED_LIST_LIMIT });
    expect(listOffset(undefined, 10)).toEqual({ skip: 0, take: UNPAGED_LIST_LIMIT });
  });

  it('pages a list requested with page, capped at the maximum page size', () => {
    expect(listOffset(2, 20)).toEqual({ skip: 20, take: 20 });
    expect(listOffset(1, 10_000)).toEqual({ skip: 0, take: MAX_PAGE_SIZE });
  });
});

describe('normalizePageRequest', () => {
  it('uses defaults when values are missing', () => {
    expect(normalizePageRequest()).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it.each([0, -3, 1.5, Number.NaN])('falls back to defaults for invalid value %p', (value) => {
    expect(normalizePageRequest(value, value)).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('keeps valid values and caps the page size', () => {
    expect(normalizePageRequest(3, 20)).toEqual({ page: 3, pageSize: 20 });
    expect(normalizePageRequest(1, 10_000)).toEqual({ page: 1, pageSize: MAX_PAGE_SIZE });
  });
});

describe('toOffset / toPage', () => {
  it('converts a page request into skip/take', () => {
    expect(toOffset({ page: 1, pageSize: 50 })).toEqual({ skip: 0, take: 50 });
    expect(toOffset({ page: 4, pageSize: 25 })).toEqual({ skip: 75, take: 25 });
  });

  it('builds a page envelope', () => {
    expect(toPage(['a', 'b'], 12, { page: 2, pageSize: 2 })).toEqual({
      items: ['a', 'b'],
      total: 12,
      page: 2,
      pageSize: 2,
    });
  });
});
