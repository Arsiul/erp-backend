import { Global, Module } from '@nestjs/common';
import { AUDIT_LOGGER } from '../../shared/domain/ports/audit-logger.port';
import { UNSEEN_RECORDS } from '../../shared/domain/ports/unseen-records.port';
import { PrismaAuditLogger } from './infrastructure/prisma-audit-logger';
import { PrismaUnseenRecords } from './infrastructure/prisma-unseen-records';

/**
 * Global writers every module uses inside its unit of work: the audit trail (AUDIT_LOGGER) and
 * the "not seen yet" marks (UNSEEN_RECORDS). Both write through the transaction host, so they
 * commit or roll back with the business change.
 */
@Global()
@Module({
  providers: [
    { provide: AUDIT_LOGGER, useClass: PrismaAuditLogger },
    { provide: UNSEEN_RECORDS, useClass: PrismaUnseenRecords },
  ],
  exports: [AUDIT_LOGGER, UNSEEN_RECORDS],
})
export class AuditLoggingModule {}
