import type { ModuleId } from '../module-id';

export const AUDIT_LOGGER = Symbol('AuditLogger');

export interface AuditActor {
  readonly userId: string | null;
  readonly userName: string;
}

export interface AuditEntry {
  readonly actor: AuditActor;
  readonly module: ModuleId;
  /** ResourceKey slug, e.g. `ventas`, `cuentas-cobrar`. */
  readonly resource: string;
  /** `Registró`, `Actualizó`, `Eliminó` or the action label (`Aprobó`, `Anuló`…). */
  readonly action: string;
  readonly reference: string;
}

/** Writes an audit entry inside the current UnitOfWork; the date comes from the Clock. */
export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}
