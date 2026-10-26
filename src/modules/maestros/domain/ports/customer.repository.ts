import type { CustomerDocumentType } from '../master-fields';
import type { CustomerLookups, CustomerRecord, CustomerValues } from '../customer';
import type { MasterRepository, StatusFilter } from './master.repository';

export const CUSTOMER_REPOSITORY = Symbol('CustomerRepository');

export interface CustomerFilter extends StatusFilter {
  readonly documentType: CustomerDocumentType | undefined;
}

export interface CustomerRepository
  extends MasterRepository<CustomerRecord, CustomerFilter>, CustomerLookups {
  create(code: string, values: CustomerValues): Promise<CustomerRecord>;
  update(id: string, values: CustomerValues): Promise<CustomerRecord>;
}
