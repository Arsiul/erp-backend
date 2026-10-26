import type { SupplierLookups, SupplierRecord, SupplierValues } from '../supplier';
import type { MasterRepository, StatusFilter } from './master.repository';

export const SUPPLIER_REPOSITORY = Symbol('SupplierRepository');

export interface SupplierRepository
  extends MasterRepository<SupplierRecord, StatusFilter>, SupplierLookups {
  create(code: string, values: SupplierValues): Promise<SupplierRecord>;
  update(id: string, values: SupplierValues): Promise<SupplierRecord>;
}
