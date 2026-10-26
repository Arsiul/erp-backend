import { randomInt, randomUUID } from 'node:crypto';
import type { ApiClient } from './api-client';

export interface Identified {
  readonly id: string;
  readonly name: string;
}

export interface ProductRecord extends Identified {
  readonly sku: string;
  readonly unit: string;
}

export interface ProductInput {
  readonly salePrice: number;
  readonly costPrice: number;
  readonly name?: string;
}

const tag = (): string => randomUUID().slice(0, 6).toUpperCase();
const digits = (length: number): string =>
  Array.from({ length }, () => String(randomInt(0, 10))).join('');

/** Creates the masters of a scenario through the API, with unique names and documents. */
export class MasterFixtures {
  constructor(private readonly api: ApiClient) {}

  warehouse(name = `Almacén ${tag()}`): Promise<Identified> {
    return this.api.create<Identified>('almacenes', { name });
  }

  category(name = `Categoría ${tag()}`): Promise<Identified> {
    return this.api.create<Identified>('categorias', { name });
  }

  product(categoryId: string, input: ProductInput): Promise<ProductRecord> {
    const sku = `SKU-${tag()}`;
    return this.api.create<ProductRecord>('productos', {
      sku,
      name: input.name ?? `Producto ${sku}`,
      categoryId,
      unit: 'und',
      salePrice: input.salePrice,
      costPrice: input.costPrice,
      minStock: 0,
    });
  }

  supplier(paymentDays: number): Promise<Identified> {
    return this.api.create<Identified>('proveedores', {
      name: `Proveedor ${tag()}`,
      ruc: `20${digits(9)}`,
      paymentDays,
    });
  }

  customerWithRuc(creditDays: number, creditLimit: number): Promise<Identified> {
    return this.api.create<Identified>('clientes', {
      name: `Cliente ${tag()} SAC`,
      documentType: 'RUC',
      documentNumber: `20${digits(9)}`,
      creditDays,
      creditLimit,
    });
  }

  customerWithDni(): Promise<Identified> {
    return this.api.create<Identified>('clientes', {
      name: `Cliente ${tag()}`,
      documentType: 'DNI',
      documentNumber: digits(8),
      creditDays: 0,
      creditLimit: 0,
    });
  }

  bankAccount(openingBalance: number): Promise<Identified> {
    return this.api.create<Identified>('cuentas-bancarias', {
      bank: 'BCP',
      name: `Cuenta ${tag()}`,
      accountNumber: `191-${digits(8)}`,
      openingBalance,
    });
  }

  /** Loads initial stock with an inventory count adjustment, as a user would. */
  async stock(productId: string, warehouseId: string, quantity: number): Promise<void> {
    await this.api.create('ajustes', {
      productId,
      warehouseId,
      type: 'increase',
      quantity,
      reason: 'count',
      notes: 'Inventario inicial de la prueba',
    });
  }
}
