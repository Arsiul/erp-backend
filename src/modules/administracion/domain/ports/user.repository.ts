import type { ActiveStatus } from '../../../../shared/domain/validation/field-rules';
import type { UserRecord, UserValues } from '../user';
import type { UserLookups } from '../user-rules';
import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';

export const USER_REPOSITORY = Symbol('UserRepository');

/** `q` searches name, email and role name; `from`/`to` apply to the creation date. */
export interface UserCriteria extends ListCriteria {
  readonly status: ActiveStatus | undefined;
  readonly roleId: string | undefined;
}

export interface UserRepository extends UserLookups {
  list(criteria: UserCriteria): Promise<ListResult<UserRecord>>;
  findById(id: string): Promise<UserRecord | null>;
  create(values: UserValues, passwordHash: string): Promise<UserRecord>;
  update(id: string, values: UserValues): Promise<UserRecord>;
  setStatus(id: string, status: ActiveStatus): Promise<UserRecord>;
  setPasswordHash(id: string, passwordHash: string): Promise<void>;
  remove(id: string): Promise<void>;
  countAudits(id: string): Promise<number>;
}
