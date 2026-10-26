import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ModuleId } from '../../../shared/domain/module-id';
import { type AuditRecord, type AuditView, toAuditView } from '../domain/audit-record';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../domain/ports/audit-log.repository';
import {
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';

export interface AuditListInput extends ListInput {
  readonly module?: ModuleId | undefined;
  readonly resource?: string | undefined;
}

/** The audit trail is written by the system only; these are its read operations. */
@Injectable()
export class AuditQueries {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly entries: AuditLogRepository) {}

  async list(input: AuditListInput): Promise<ListOutput<AuditView>> {
    const result = await this.entries.list({
      ...toListCriteria(input),
      module: input.module,
      resource: input.resource,
    });
    return {
      items: result.items.map(toAuditView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<AuditView> {
    return toAuditView(await this.require(id));
  }

  /** No action exists for audit entries: an existing entry answers 404 for any of them. */
  async runAction(id: string, actionId: string): Promise<AuditView> {
    const entry = await this.require(id);
    requireAction('auditoria', actionId);
    return toAuditView(entry);
  }

  private async require(id: string): Promise<AuditRecord> {
    const entry = await this.entries.findById(id);
    if (entry === null) {
      throw new NotFoundError();
    }
    return entry;
  }
}
