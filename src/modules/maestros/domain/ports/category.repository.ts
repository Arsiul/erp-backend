import type { CategoryLookups, CategoryRecord, CategoryValues } from '../category';
import type { MasterRepository, StatusFilter } from './master.repository';

export const CATEGORY_REPOSITORY = Symbol('CategoryRepository');

export interface CategoryRepository
  extends MasterRepository<CategoryRecord, StatusFilter>, CategoryLookups {
  create(code: string, values: CategoryValues): Promise<CategoryRecord>;
  update(id: string, values: CategoryValues): Promise<CategoryRecord>;
}
