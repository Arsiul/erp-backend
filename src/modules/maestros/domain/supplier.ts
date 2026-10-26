import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  optionalText,
  requireText,
} from '../../../shared/domain/validation/field-rules';
import { optionalEmail, validRuc, wholeNumber } from './master-fields';

export const SUPPLIER_RUC_TAKEN = 'Ya existe un proveedor con ese RUC.';
export const SUPPLIER_IN_USE =
  'El proveedor tiene órdenes o facturas; desactívalo en lugar de eliminarlo.';
export const SUPPLIER_CODE = { key: 'proveedores', prefix: 'PRV-', digits: 4 } as const;

export interface SupplierValues {
  readonly name: string;
  readonly ruc: string;
  readonly contactName: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly paymentDays: number;
  readonly status: ActiveStatus;
}

/** The shape of `Supplier` in the frontend. */
export interface SupplierRecord extends SupplierValues {
  readonly id: string;
  readonly code: string;
}

export type SupplierInput = { readonly [K in keyof SupplierValues]?: unknown };

export interface SupplierLookups {
  isRucTaken(ruc: string, exceptId?: string): Promise<boolean>;
}

export async function supplierValues(
  input: SupplierInput,
  lookups: SupplierLookups,
  exceptId?: string,
): Promise<SupplierValues> {
  const ruc = validRuc(input.ruc);
  if (await lookups.isRucTaken(ruc, exceptId)) {
    throw new BusinessError(SUPPLIER_RUC_TAKEN);
  }
  return {
    name: requireText(input.name, 'Escribe la razón social.'),
    ruc,
    contactName: optionalText(input.contactName),
    email: optionalEmail(input.email),
    phone: optionalText(input.phone),
    address: optionalText(input.address),
    paymentDays: wholeNumber(input.paymentDays, 'Los días de pago deben ser un entero desde 0.'),
    status: activeStatus(input.status),
  };
}
