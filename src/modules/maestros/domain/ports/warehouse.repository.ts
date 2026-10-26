import type { WarehouseLookups, WarehouseRecord, WarehouseValues } from '../warehouse';
import type { MasterRepository, StatusFilter } from './master.repository';

export const WAREHOUSE_REPOSITORY = Symbol('WarehouseRepository');

export interface WarehouseRepository
  extends MasterRepository<WarehouseRecord, StatusFilter>, WarehouseLookups {
  create(code: string, values: WarehouseValues): Promise<WarehouseRecord>;
  update(id: string, values: WarehouseValues): Promise<WarehouseRecord>;
}
