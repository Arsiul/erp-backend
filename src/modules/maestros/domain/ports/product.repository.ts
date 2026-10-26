import type { ProductLookups, ProductRecord, ProductValues } from '../product';
import type { MasterRepository, StatusFilter } from './master.repository';

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');

export interface ProductFilter extends StatusFilter {
  readonly categoryId: string | undefined;
}

export interface ProductRepository
  extends MasterRepository<ProductRecord, ProductFilter>, ProductLookups {
  create(values: ProductValues): Promise<ProductRecord>;
  update(id: string, values: ProductValues): Promise<ProductRecord>;
  /** Copies the product minimum stock to its stock rows of every warehouse. */
  syncMinStock(id: string, minStock: number): Promise<void>;
}
