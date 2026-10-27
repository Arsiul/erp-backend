export const UNIT_OF_WORK = Symbol('UnitOfWork');

export type IsolationLevel = 'read-committed' | 'repeatable-read' | 'serializable';

export interface UnitOfWorkOptions {
  readonly isolationLevel?: IsolationLevel;
  /** Overrides the default transaction timeout, for long batches such as CSV imports. */
  readonly timeoutMs?: number;
}

/**
 * Runs `work` inside a single database transaction. Every repository and ledger used
 * inside `work` joins it automatically; nested calls reuse the outer transaction.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T>;
}
