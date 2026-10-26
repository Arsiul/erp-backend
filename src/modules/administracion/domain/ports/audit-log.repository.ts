import type { ModuleId } from '../../../../shared/domain/module-id';
import type { AuditRecord } from '../audit-record';
import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';

export const AUDIT_LOG_REPOSITORY = Symbol('AuditLogRepository');

/** `q` searches user, resource, action and reference; `from`/`to` apply to the entry date. */
export interface AuditCriteria extends ListCriteria {
  readonly module: ModuleId | undefined;
  readonly resource: string | undefined;
}

export interface AuditLogRepository {
  list(criteria: AuditCriteria): Promise<ListResult<AuditRecord>>;
  findById(id: string): Promise<AuditRecord | null>;
}
