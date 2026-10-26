import { Injectable } from '@nestjs/common';
import {
  AUTOMATIC_RESOURCES,
  RESOURCE_MODULE,
  type ResourceKey,
} from '../../../shared/domain/authorization/resources';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';

const AUTOMATIC: readonly ResourceKey[] = AUTOMATIC_RESOURCES;

/** Marks new records for the users whose role can read the record's module. */
@Injectable()
export class PrismaUnseenRecords implements UnseenRecords {
  constructor(private readonly host: PrismaTransactionHost) {}

  async recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    if (AUTOMATIC.includes(resource)) {
      return;
    }
    const readers = await this.host.client.user.findMany({
      where: {
        id: { not: authorId },
        role: {
          permissions: {
            some: { module: RESOURCE_MODULE[resource], access: { in: ['read', 'write'] } },
          },
        },
      },
      select: { id: true },
    });
    if (readers.length === 0) {
      return;
    }
    await this.host.client.unseenRecord.createMany({
      data: readers.map((reader) => ({ userId: reader.id, resource, recordId })),
      skipDuplicates: true,
    });
  }

  async forget(resource: ResourceKey, recordId: string): Promise<void> {
    await this.host.client.unseenRecord.deleteMany({ where: { resource, recordId } });
  }
}
