import type { ModuleId } from '../../../shared/domain/module-id';
import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';

export interface AuditRecord {
  readonly id: string;
  readonly date: Date;
  readonly userName: string;
  readonly module: ModuleId;
  readonly resource: string;
  readonly action: string;
  readonly reference: string;
}

/** The shape of `AuditEntry` in the frontend. */
export interface AuditView extends Omit<AuditRecord, 'date'> {
  /** `YYYY-MM-DDTHH:mm` in Lima. */
  readonly date: string;
}

export const toAuditView = (entry: AuditRecord): AuditView => ({
  ...entry,
  date: formatLimaDateTime(entry.date),
});

export const PASSWORD_RESET_ACTION = 'Restableció contraseña';
