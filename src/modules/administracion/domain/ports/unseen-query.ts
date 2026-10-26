import type { ResourceKey } from '../../../../shared/domain/authorization/resources';

export const UNSEEN_QUERY = Symbol('UnseenQuery');

/** Reading and clearing the "new record" marks of the current user. */
export interface UnseenQuery {
  listFor(userId: string, resource: ResourceKey): Promise<string[]>;
  markSeen(userId: string, resource: ResourceKey, recordId: string): Promise<void>;
}
