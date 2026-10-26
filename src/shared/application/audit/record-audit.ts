import { actorOf } from '../../domain/authorization/authenticated-user';
import type { ResourceKey } from '../../domain/authorization/resources';
import type { ModuleId } from '../../domain/module-id';
import type { AuditLogger } from '../../domain/ports/audit-logger.port';
import type { ActingUser } from '../listing/list-query';

/** Writes the audit entry of a document of `module`; `reference` is its number or code. */
export const recordAudit = (
  audit: AuditLogger,
  module: ModuleId,
  actor: ActingUser,
  resource: ResourceKey,
  action: string,
  reference: string,
): Promise<void> => audit.record({ actor: actorOf(actor), module, resource, action, reference });
