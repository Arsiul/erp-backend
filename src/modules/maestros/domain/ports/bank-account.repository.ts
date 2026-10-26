import type {
  BankAccountChanges,
  BankAccountLookups,
  BankAccountRecord,
  BankAccountValues,
} from '../bank-account';
import type { MasterRepository, StatusFilter } from './master.repository';

export const BANK_ACCOUNT_REPOSITORY = Symbol('BankAccountRepository');

export interface BankAccountRepository
  extends MasterRepository<BankAccountRecord, StatusFilter>, BankAccountLookups {
  create(values: BankAccountValues): Promise<BankAccountRecord>;
  update(id: string, changes: BankAccountChanges): Promise<BankAccountRecord>;
}
