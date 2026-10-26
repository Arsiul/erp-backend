import type { RoleRecord, RoleValues } from '../role';
import type { RoleLookups } from '../role-rules';
import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';

export const ROLE_REPOSITORY = Symbol('RoleRepository');

/** `q` searches name and description; `from`/`to` apply to the creation date. */
export interface RoleRepository extends RoleLookups {
  list(criteria: ListCriteria): Promise<ListResult<RoleRecord>>;
  findById(id: string): Promise<RoleRecord | null>;
  create(values: RoleValues): Promise<RoleRecord>;
  update(id: string, values: RoleValues): Promise<RoleRecord>;
  remove(id: string): Promise<void>;
  countUsers(id: string): Promise<number>;
}
