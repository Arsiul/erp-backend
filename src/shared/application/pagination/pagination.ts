export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
/**
 * Ceiling of a list requested without `page`. The frontend loads whole lists (tables filtered in
 * the browser, selects and combos), so the ceiling is high, but a list never reads every row.
 */
export const UNPAGED_LIST_LIMIT = 5_000;

export interface PageRequest {
  /** 1-based page number. */
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface Offset {
  readonly skip: number;
  readonly take: number;
}

/** Normalizes untrusted page values: page >= 1 and 1 <= pageSize <= MAX_PAGE_SIZE. */
export function normalizePageRequest(page?: number, pageSize?: number): PageRequest {
  const requested = positiveIntegerOr(pageSize, DEFAULT_PAGE_SIZE);
  return { page: positiveIntegerOr(page, 1), pageSize: Math.min(requested, MAX_PAGE_SIZE) };
}

function positiveIntegerOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : fallback;
}

/** Window of a list: the requested page, or the newest `UNPAGED_LIST_LIMIT` rows without `page`. */
export function listOffset(page?: number, pageSize?: number): Offset {
  return page === undefined
    ? { skip: 0, take: UNPAGED_LIST_LIMIT }
    : toOffset(normalizePageRequest(page, pageSize));
}

export function toOffset(request: PageRequest): Offset {
  return { skip: (request.page - 1) * request.pageSize, take: request.pageSize };
}

export function toPage<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return { items, total, page: request.page, pageSize: request.pageSize };
}
