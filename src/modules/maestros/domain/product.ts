import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  requireText,
} from '../../../shared/domain/validation/field-rules';
import { moneyAmount, referenceId, requireReference, wholeNumber } from './master-fields';

export const PRODUCT_SKU_TAKEN = 'Ya existe un producto con ese SKU.';
export const PRODUCT_IN_USE =
  'El producto ya tiene movimientos; desactívalo en lugar de eliminarlo.';
const SALE_PRICE = 'El precio de venta debe ser mayor que cero.';

export interface ProductValues {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly unit: string;
  readonly salePrice: number;
  readonly costPrice: number;
  readonly minStock: number;
  readonly status: ActiveStatus;
}

/** The shape of `Product` in the frontend; `categoryName` is joined from the category. */
export interface ProductRecord extends ProductValues {
  readonly id: string;
  readonly categoryName: string;
}

export type ProductInput = { readonly [K in keyof ProductValues]?: unknown };

export interface CategoryReference {
  readonly id: string;
  readonly status: ActiveStatus;
}

export interface ProductLookups {
  isSkuTaken(sku: string, exceptId?: string): Promise<boolean>;
  findCategory(id: string): Promise<CategoryReference | null>;
}

/**
 * A product may stay in a category that was deactivated; an active one is only required
 * when the category is chosen or changed.
 */
export async function productValues(
  input: ProductInput,
  lookups: ProductLookups,
  current?: Pick<ProductRecord, 'id' | 'categoryId'>,
): Promise<ProductValues> {
  const sku = requireText(input.sku, 'Escribe el SKU.').toUpperCase();
  if (await lookups.isSkuTaken(sku, current?.id)) {
    throw new BusinessError(PRODUCT_SKU_TAKEN);
  }
  const categoryId = referenceId(input.categoryId);
  const category = requireReference(
    categoryId === null ? null : await lookups.findCategory(categoryId),
    'la categoría',
    categoryId !== current?.categoryId,
  );
  const salePrice = moneyAmount(input.salePrice, SALE_PRICE);
  if (salePrice <= 0) {
    throw new BusinessError(SALE_PRICE);
  }
  return {
    sku,
    name: requireText(input.name, 'Escribe el nombre del producto.'),
    categoryId: category.id,
    unit: requireText(input.unit, 'Elige la unidad de medida.'),
    salePrice,
    costPrice: moneyAmount(input.costPrice ?? 0, 'El costo no puede ser negativo.'),
    minStock: wholeNumber(input.minStock, 'El stock mínimo debe ser un entero desde 0.'),
    status: activeStatus(input.status),
  };
}
