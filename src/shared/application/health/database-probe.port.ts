export const DATABASE_PROBE = Symbol('DatabaseProbe');

export interface DatabaseProbe {
  /** Resolves when the database answers a trivial query; rejects otherwise. */
  ping(): Promise<void>;
}
