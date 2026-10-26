import { Inject, Injectable } from '@nestjs/common';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { UNSEEN_QUERY, type UnseenQuery } from '../domain/ports/unseen-query';

/** "New" badges: ids created by others that the current user has not opened yet. */
@Injectable()
export class UnseenUseCases {
  constructor(@Inject(UNSEEN_QUERY) private readonly unseen: UnseenQuery) {}

  list(userId: string, resource: ResourceKey): Promise<string[]> {
    return this.unseen.listFor(userId, resource);
  }

  markSeen(userId: string, resource: ResourceKey, recordId: string): Promise<void> {
    return this.unseen.markSeen(userId, resource, recordId);
  }
}
