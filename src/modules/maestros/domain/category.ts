import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  optionalText,
  requireText,
} from '../../../shared/domain/validation/field-rules';

export const CATEGORY_NAME_TAKEN = 'Ya existe una categoría con ese nombre.';
export const CATEGORY_IN_USE =
  'La categoría tiene productos; muévelos a otra categoría antes de eliminarla.';
export const CATEGORY_CODE = { key: 'categorias', prefix: 'CAT-', digits: 3 } as const;

export interface CategoryValues {
  readonly name: string;
  readonly description: string;
  readonly status: ActiveStatus;
}

/** The shape of `Category` in the frontend. */
export interface CategoryRecord extends CategoryValues {
  readonly id: string;
  readonly code: string;
}

export type CategoryInput = { readonly [K in keyof CategoryValues]?: unknown };

export interface CategoryLookups {
  isNameTaken(name: string, exceptId?: string): Promise<boolean>;
}

export async function categoryValues(
  input: CategoryInput,
  lookups: CategoryLookups,
  exceptId?: string,
): Promise<CategoryValues> {
  const name = requireText(input.name, 'Escribe el nombre de la categoría.');
  if (await lookups.isNameTaken(name, exceptId)) {
    throw new BusinessError(CATEGORY_NAME_TAKEN);
  }
  return { name, description: optionalText(input.description), status: activeStatus(input.status) };
}
