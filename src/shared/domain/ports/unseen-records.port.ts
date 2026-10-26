import type { ResourceKey } from '../authorization/resources';

export const UNSEEN_RECORDS = Symbol('UnseenRecords');

/**
 * "New" marks per user. Both methods run inside the current UnitOfWork, so a create that fails
 * leaves no marks behind.
 */
export interface UnseenRecords {
  /** Marks the record as new for every user who can read its module, except the author. */
  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void>;
  /** Drops the marks of a removed record. */
  forget(resource: ResourceKey, recordId: string): Promise<void>;
}
