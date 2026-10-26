import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type { ActiveStatus } from '../../../../shared/domain/validation/field-rules';

export interface MasterRecord {
  readonly id: string;
  readonly status: ActiveStatus;
}

/** Filter every master list accepts besides the shared ones. */
export interface StatusFilter {
  readonly status: ActiveStatus | undefined;
}

/** Operations every master resource shares; the use case base class drives them. */
export interface MasterRepository<R extends MasterRecord, F extends StatusFilter> {
  list(criteria: ListCriteria & F): Promise<ListResult<R>>;
  findById(id: string): Promise<R | null>;
  setStatus(id: string, status: ActiveStatus): Promise<R>;
  /** True when another record points to it, so it can only be deactivated. */
  isInUse(id: string): Promise<boolean>;
  remove(id: string): Promise<void>;
}
