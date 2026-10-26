import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';

/**
 * Writes through the transaction host, so an entry recorded inside a UnitOfWork commits or rolls
 * back together with the change it describes.
 */
@Injectable()
export class PrismaAuditLogger implements AuditLogger {
  constructor(
    private readonly host: PrismaTransactionHost,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.host.client.auditLog.create({
      data: {
        date: this.clock.now(),
        userId: entry.actor.userId,
        userName: entry.actor.userName,
        module: entry.module,
        resource: entry.resource,
        action: entry.action,
        reference: entry.reference,
      },
    });
  }
}
