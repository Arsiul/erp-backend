import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { AuditLog, Prisma } from '../../../generated/prisma/client';
import type { AuditRecord } from '../domain/audit-record';
import type { AuditCriteria, AuditLogRepository } from '../domain/ports/audit-log.repository';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, dateRange, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';

const toRecord = (row: AuditLog): AuditRecord => ({
  id: row.id,
  date: row.date,
  userName: row.userName,
  module: row.module,
  resource: row.resource,
  action: row.action,
  reference: row.reference,
});

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: AuditCriteria): Promise<ListResult<AuditRecord>> {
    const date = dateRange(criteria);
    const where: Prisma.AuditLogWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { userName: contains(criteria.q) },
              { resource: contains(criteria.q) },
              { action: contains(criteria.q) },
              { reference: contains(criteria.q) },
            ],
          }),
      ...(criteria.module === undefined ? {} : { module: criteria.module }),
      ...(criteria.resource === undefined ? {} : { resource: criteria.resource }),
      ...(date === undefined ? {} : { date }),
    };
    const total = await this.host.client.auditLog.count({ where });
    const rows = await this.host.client.auditLog.findMany({ where, ...listWindow(criteria) });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<AuditRecord | null> {
    const row = await this.host.client.auditLog.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }
}
