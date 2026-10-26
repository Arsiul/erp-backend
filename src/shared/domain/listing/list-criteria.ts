export type SortOrder = 'asc' | 'desc';

/** Rows to skip and take; every list is bounded. */
export interface ListWindow {
  readonly skip: number;
  readonly take: number;
}

/** Filters shared by every list: free text, date range and order of creation. */
export interface ListCriteria {
  readonly q: string;
  /** Inclusive lower bound. */
  readonly from: Date | undefined;
  /** Exclusive upper bound. */
  readonly to: Date | undefined;
  readonly order: SortOrder;
  readonly window: ListWindow;
}

export interface ListResult<T> {
  readonly items: readonly T[];
  readonly total: number;
}
