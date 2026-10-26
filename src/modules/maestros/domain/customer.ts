import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type ActiveStatus,
  activeStatus,
  optionalText,
  pickEnum,
  requireText,
} from '../../../shared/domain/validation/field-rules';
import {
  CUSTOMER_DOCUMENT_TYPES,
  type CustomerDocumentType,
  customerDocument,
  moneyAmount,
  optionalEmail,
  wholeNumber,
} from './master-fields';

export const CUSTOMER_DOCUMENT_TAKEN = 'Ya existe un cliente con ese documento.';
export const CUSTOMER_IN_USE =
  'El cliente tiene cotizaciones o ventas; desactívalo en lugar de eliminarlo.';
export const CUSTOMER_CODE = { key: 'clientes', prefix: 'CLI-', digits: 4 } as const;

export interface CustomerValues {
  readonly name: string;
  readonly documentType: CustomerDocumentType;
  readonly documentNumber: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly creditDays: number;
  readonly creditLimit: number;
  readonly status: ActiveStatus;
}

/** The shape of `Customer` in the frontend. */
export interface CustomerRecord extends CustomerValues {
  readonly id: string;
  readonly code: string;
}

export type CustomerInput = { readonly [K in keyof CustomerValues]?: unknown };

export interface CustomerLookups {
  isDocumentTaken(documentNumber: string, exceptId?: string): Promise<boolean>;
}

export async function customerValues(
  input: CustomerInput,
  lookups: CustomerLookups,
  exceptId?: string,
): Promise<CustomerValues> {
  const documentType = pickEnum(
    input.documentType,
    CUSTOMER_DOCUMENT_TYPES,
    'Elige el tipo de documento.',
  );
  const documentNumber = customerDocument(documentType, input.documentNumber);
  if (await lookups.isDocumentTaken(documentNumber, exceptId)) {
    throw new BusinessError(CUSTOMER_DOCUMENT_TAKEN);
  }
  const creditDays = wholeNumber(
    input.creditDays,
    'Los días de crédito deben ser un entero desde 0.',
  );
  const creditLimit = moneyAmount(
    input.creditLimit ?? 0,
    'El límite de crédito no puede ser negativo.',
  );
  if (creditDays > 0 && creditLimit <= 0) {
    throw new BusinessError('Un cliente con días de crédito necesita un límite de crédito.');
  }
  return {
    name: requireText(input.name, 'Escribe la razón social o el nombre.'),
    documentType,
    documentNumber,
    email: optionalEmail(input.email),
    phone: optionalText(input.phone),
    address: optionalText(input.address),
    creditDays,
    creditLimit,
    status: activeStatus(input.status),
  };
}
