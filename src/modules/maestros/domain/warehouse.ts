import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  optionalText,
  requireText,
} from '../../../shared/domain/validation/field-rules';

export const WAREHOUSE_NAME_TAKEN = 'Ya existe un almacén con ese nombre.';
export const WAREHOUSE_IN_USE =
  'El almacén ya tiene movimientos; desactívalo en lugar de eliminarlo.';
export const WAREHOUSE_CODE = { key: 'almacenes', prefix: 'ALM-', digits: 2 } as const;

export interface WarehouseValues {
  readonly name: string;
  readonly address: string;
  readonly manager: string;
  readonly status: ActiveStatus;
}

/** The shape of `Warehouse` in the frontend. */
export interface WarehouseRecord extends WarehouseValues {
  readonly id: string;
  readonly code: string;
}

export type WarehouseInput = { readonly [K in keyof WarehouseValues]?: unknown };

export interface WarehouseLookups {
  isNameTaken(name: string, exceptId?: string): Promise<boolean>;
}

export async function warehouseValues(
  input: WarehouseInput,
  lookups: WarehouseLookups,
  exceptId?: string,
): Promise<WarehouseValues> {
  const name = requireText(input.name, 'Escribe el nombre del almacén.');
  if (await lookups.isNameTaken(name, exceptId)) {
    throw new BusinessError(WAREHOUSE_NAME_TAKEN);
  }
  return {
    name,
    address: optionalText(input.address),
    manager: optionalText(input.manager),
    status: activeStatus(input.status),
  };
}
