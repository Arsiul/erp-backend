import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type { ActiveStatus } from '../../../../shared/domain/validation/field-rules';
import type {
  MovementConcept,
  MovementRecord,
  MovementStatus,
  MovementType,
  MovementValues,
  PaymentMethod,
} from '../treasury';

export const BANK_ACCOUNT_CATALOG = Symbol('BankAccountCatalog');
export const MOVEMENT_REPOSITORY = Symbol('MovementRepository');

export interface CatalogAccount {
  readonly id: string;
  readonly name: string;
  readonly status: ActiveStatus;
}

export interface BankAccountCatalog {
  findAccount(id: string): Promise<CatalogAccount | null>;
}

export interface MovementCriteria extends ListCriteria {
  readonly accountId: string | undefined;
  readonly type: MovementType | undefined;
  readonly concept: MovementConcept | undefined;
  readonly method: PaymentMethod | undefined;
  readonly status: MovementStatus | undefined;
}

export interface MovementRepository {
  list(criteria: MovementCriteria): Promise<ListResult<MovementRecord>>;
  findById(id: string): Promise<MovementRecord | null>;
  /** Locks the row until the transaction ends. */
  lockById(id: string): Promise<MovementRecord | null>;
  create(number: string, values: MovementValues): Promise<MovementRecord>;
  setNotes(id: string, notes: string): Promise<MovementRecord>;
  setStatus(id: string, status: MovementStatus): Promise<MovementRecord>;
}
