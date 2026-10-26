import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { MAX_AMOUNT, MAX_INTEGER } from '../../../shared/domain/validation/numeric-limits';
import {
  ACCOUNT_NUMBER_TAKEN,
  type BankAccountLookups,
  type BankAccountRecord,
  bankAccountChanges,
  bankAccountValues,
} from './bank-account';
import { CATEGORY_NAME_TAKEN, categoryValues } from './category';
import { CUSTOMER_DOCUMENT_TAKEN, customerValues } from './customer';
import {
  customerDocument,
  moneyAmount,
  optionalEmail,
  referenceId,
  requireReference,
  validRuc,
  wholeNumber,
} from './master-fields';
import { PRODUCT_SKU_TAKEN, type ProductLookups, productValues } from './product';
import { SUPPLIER_RUC_TAKEN, supplierValues } from './supplier';
import { WAREHOUSE_NAME_TAKEN, warehouseValues } from './warehouse';

const TAKEN = 'tomado';
const RUC = '20123456789';

/** Every uniqueness lookup answers «taken» only for the value `tomado` (or the taken RUC). */
const taken = (value: string): Promise<boolean> =>
  Promise.resolve(value === TAKEN || value === 'TOMADO' || value === '20999999999');

describe('master fields', () => {
  it('normalizes or rejects an email', () => {
    expect(optionalEmail(' Ventas@Empresa.PE ')).toBe('ventas@empresa.pe');
    expect(optionalEmail(undefined)).toBe('');
    expect(() => optionalEmail('no-es-correo')).toThrow('El correo no es válido.');
  });

  it('validates the RUC and the customer documents', () => {
    expect(validRuc(RUC)).toBe(RUC);
    expect(() => validRuc('30123456789')).toThrow(BusinessError);
    expect(customerDocument('RUC', ` ${RUC} `)).toBe(RUC);
    expect(customerDocument('DNI', '12345678')).toBe('12345678');
    expect(() => customerDocument('DNI', '1234')).toThrow('El DNI debe tener 8 dígitos.');
    expect(customerDocument('CE', 'ab1234567')).toBe('AB1234567');
    expect(() => customerDocument('CE', 'ab-1')).toThrow(
      'El carné de extranjería debe tener de 9 a 12 caracteres.',
    );
  });

  it('parses numbers within their limits', () => {
    expect(moneyAmount(10.126, 'x')).toBe(10.13);
    expect(() => moneyAmount(MAX_AMOUNT + 1, 'monto')).toThrow('monto');
    expect(wholeNumber(undefined, 'x')).toBe(0);
    expect(wholeNumber(7, 'x')).toBe(7);
    expect(() => wholeNumber(1.5, 'entero')).toThrow('entero');
    expect(() => wholeNumber(MAX_INTEGER + 1, 'entero')).toThrow('entero');
  });

  it('resolves references and formats codes', () => {
    expect(referenceId('c1')).toBe('c1');
    expect(referenceId('')).toBeNull();
    expect(referenceId(3)).toBeNull();
    const inactive = { id: 'c1', status: 'inactive' as const };
    expect(() => requireReference(null, 'la categoría', true)).toThrow('Selecciona la categoría.');
    expect(() => requireReference(inactive, 'la categoría', true)).toThrow(
      'No puedes usar la categoría porque está en estado inactivo.',
    );
    expect(requireReference(inactive, 'la categoría', false)).toBe(inactive);
  });
});

describe('customerValues', () => {
  const lookups = { isDocumentTaken: taken };

  it('builds a customer with its defaults', async () => {
    await expect(
      customerValues(
        { name: ' Comercial Andina ', documentType: 'RUC', documentNumber: RUC },
        lookups,
      ),
    ).resolves.toEqual({
      name: 'Comercial Andina',
      documentType: 'RUC',
      documentNumber: RUC,
      email: '',
      phone: '',
      address: '',
      creditDays: 0,
      creditLimit: 0,
      status: 'active',
    });
  });

  it('rejects a taken document, a missing type and credit days without a limit', async () => {
    const base = { name: 'A', documentType: 'DNI', documentNumber: '12345678' };
    const isDocumentTaken = jest.fn(() => Promise.resolve(true));
    await expect(customerValues(base, { isDocumentTaken }, 'c1')).rejects.toThrow(
      CUSTOMER_DOCUMENT_TAKEN,
    );
    expect(isDocumentTaken).toHaveBeenCalledWith('12345678', 'c1');
    await expect(customerValues({ ...base, documentType: 'X' }, lookups)).rejects.toThrow(
      'Elige el tipo de documento.',
    );
    await expect(customerValues({ ...base, creditDays: 30 }, lookups)).rejects.toThrow(
      'Un cliente con días de crédito necesita un límite de crédito.',
    );
    await expect(
      customerValues({ ...base, creditDays: 30, creditLimit: 5000 }, lookups),
    ).resolves.toMatchObject({ creditDays: 30, creditLimit: 5000 });
    await expect(customerValues({ ...base, name: ' ' }, lookups)).rejects.toThrow(
      'Escribe la razón social o el nombre.',
    );
  });
});

describe('supplierValues', () => {
  it('builds a supplier and rejects a taken RUC', async () => {
    const lookups = { isRucTaken: taken };
    await expect(
      supplierValues(
        { name: 'Proveedor', ruc: RUC, email: 'A@B.PE', paymentDays: 15, status: 'inactive' },
        lookups,
      ),
    ).resolves.toEqual({
      name: 'Proveedor',
      ruc: RUC,
      contactName: '',
      email: 'a@b.pe',
      phone: '',
      address: '',
      paymentDays: 15,
      status: 'inactive',
    });
    await expect(supplierValues({ name: 'P', ruc: '20999999999' }, lookups)).rejects.toThrow(
      SUPPLIER_RUC_TAKEN,
    );
    await expect(supplierValues({ name: 'P', ruc: RUC, paymentDays: -1 }, lookups)).rejects.toThrow(
      'Los días de pago deben ser un entero desde 0.',
    );
  });
});

describe('categoryValues and warehouseValues', () => {
  const lookups = { isNameTaken: taken };

  it('builds a category and rejects a taken name', async () => {
    await expect(categoryValues({ name: 'Ferretería' }, lookups)).resolves.toEqual({
      name: 'Ferretería',
      description: '',
      status: 'active',
    });
    await expect(categoryValues({ name: TAKEN }, lookups)).rejects.toThrow(CATEGORY_NAME_TAKEN);
    await expect(categoryValues({}, lookups)).rejects.toThrow('Escribe el nombre de la categoría.');
  });

  it('builds a warehouse and rejects a taken name', async () => {
    await expect(warehouseValues({ name: 'Central', manager: ' Ana ' }, lookups)).resolves.toEqual({
      name: 'Central',
      address: '',
      manager: 'Ana',
      status: 'active',
    });
    await expect(warehouseValues({ name: TAKEN }, lookups)).rejects.toThrow(WAREHOUSE_NAME_TAKEN);
    await expect(warehouseValues({}, lookups)).rejects.toThrow('Escribe el nombre del almacén.');
  });
});

describe('productValues', () => {
  const categories = new Map([
    ['activa', { id: 'activa', status: 'active' as const }],
    ['inactiva', { id: 'inactiva', status: 'inactive' as const }],
  ]);
  const lookups: ProductLookups = {
    isSkuTaken: taken,
    findCategory: (id) => Promise.resolve(categories.get(id) ?? null),
  };
  const input = {
    sku: 'tor-01',
    name: 'Tornillo',
    categoryId: 'activa',
    unit: 'UND',
    salePrice: 2,
  };

  it('builds a product with an uppercase SKU', async () => {
    await expect(productValues(input, lookups)).resolves.toEqual({
      sku: 'TOR-01',
      name: 'Tornillo',
      categoryId: 'activa',
      unit: 'UND',
      salePrice: 2,
      costPrice: 0,
      minStock: 0,
      status: 'active',
    });
  });

  it('rejects a taken SKU, a missing or inactive category and a free price', async () => {
    await expect(productValues({ ...input, sku: TAKEN }, lookups)).rejects.toThrow(
      PRODUCT_SKU_TAKEN,
    );
    await expect(productValues({ ...input, categoryId: '' }, lookups)).rejects.toThrow(
      'Selecciona la categoría.',
    );
    await expect(productValues({ ...input, categoryId: 'nada' }, lookups)).rejects.toThrow(
      'Selecciona la categoría.',
    );
    await expect(productValues({ ...input, categoryId: 'inactiva' }, lookups)).rejects.toThrow(
      'No puedes usar la categoría porque está en estado inactivo.',
    );
    await expect(productValues({ ...input, salePrice: 0 }, lookups)).rejects.toThrow(
      'El precio de venta debe ser mayor que cero.',
    );
    await expect(productValues({ ...input, costPrice: -1 }, lookups)).rejects.toThrow(
      'El costo no puede ser negativo.',
    );
  });

  it('keeps an inactive category that the product already had', async () => {
    const current = { id: 'p1', categoryId: 'inactiva' };
    await expect(
      productValues({ ...input, categoryId: 'inactiva', minStock: 5 }, lookups, current),
    ).resolves.toMatchObject({ categoryId: 'inactiva', minStock: 5 });
  });
});

describe('bank accounts', () => {
  const lookups: BankAccountLookups = { isAccountNumberTaken: taken };
  const current: BankAccountRecord = {
    id: 'b1',
    bank: 'BCP',
    name: 'Soles',
    accountNumber: '191-1',
    openingBalance: 100,
    balance: 250,
    status: 'active',
  };

  it('opens an account with its balance equal to the opening balance', async () => {
    await expect(
      bankAccountValues({ bank: 'BCP', name: 'Soles', accountNumber: '191-1' }, lookups),
    ).resolves.toEqual({
      bank: 'BCP',
      name: 'Soles',
      accountNumber: '191-1',
      openingBalance: 0,
      balance: 0,
      status: 'active',
    });
    await expect(
      bankAccountValues({ bank: 'B', name: 'N', accountNumber: '1', openingBalance: 50 }, lookups),
    ).resolves.toMatchObject({ openingBalance: 50, balance: 50 });
    await expect(
      bankAccountValues({ bank: 'B', name: 'N', accountNumber: TAKEN }, lookups),
    ).rejects.toThrow(ACCOUNT_NUMBER_TAKEN);
    await expect(
      bankAccountValues({ bank: 'B', name: 'N', accountNumber: '1', openingBalance: -1 }, lookups),
    ).rejects.toThrow('El saldo inicial no puede ser negativo.');
  });

  it('changes only the editable fields and keeps the rest', async () => {
    await expect(bankAccountChanges(current, { name: 'Dólares' }, lookups)).resolves.toEqual({
      bank: 'BCP',
      name: 'Dólares',
      accountNumber: '191-1',
      status: 'active',
    });
    const isAccountNumberTaken = jest.fn(() => Promise.resolve(true));
    await expect(
      bankAccountChanges(current, { accountNumber: '2' }, { isAccountNumberTaken }),
    ).rejects.toThrow(ACCOUNT_NUMBER_TAKEN);
    expect(isAccountNumberTaken).toHaveBeenCalledWith('2', 'b1');
  });
});
