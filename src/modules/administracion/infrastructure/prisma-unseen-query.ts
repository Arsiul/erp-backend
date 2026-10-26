import { Injectable } from '@nestjs/common';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { UnseenQuery } from '../domain/ports/unseen-query';

@Injectable()
export class PrismaUnseenQuery implements UnseenQuery {
  constructor(private readonly host: PrismaTransactionHost) {}

  async listFor(userId: string, resource: ResourceKey): Promise<string[]> {
    const rows = await this.host.client.unseenRecord.findMany({
      where: { userId, resource },
      select: { recordId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.recordId);
  }

  async markSeen(userId: string, resource: ResourceKey, recordId: string): Promise<void> {
    await this.host.client.unseenRecord.deleteMany({ where: { userId, resource, recordId } });
  }
}
