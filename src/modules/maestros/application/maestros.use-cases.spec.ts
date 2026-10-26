import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { SequenceGenerator } from '../../../shared/domain/ports/sequence-generator.port';
import type { StockBalance, StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import type { ActingUser } from '../../../shared/application/listing/list-query';
import { UNKNOWN_ACTION } from '../../../shared/application/listing/resource-actions';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';
import type {
  BankAccountChanges,
  BankAccountRecord,
  BankAccountValues,
} from '../domain/bank-account';
import type { CategoryRecord, CategoryValues } from '../domain/category';
import { CUSTOMER_IN_USE, type CustomerRecord, type CustomerValues } from '../domain/customer';
import type { CategoryReference, ProductRecord, ProductValues } from '../domain/product';
import type { SupplierRecord, SupplierValues } from '../domain/supplier';
import type { WarehouseRecord, WarehouseValues } from '../domain/warehouse';
import type { BankAccountRepository } from '../domain/ports/bank-account.repository';
import type { CategoryRepository } from '../domain/ports/category.repository';
import type { CustomerFilter, CustomerRepository } from '../domain/ports/customer.repository';
import type {
  MasterRecord,
  MasterRepository,
  StatusFilter,
} from '../domain/ports/master.repository';
import type { ProductFilter, ProductRepository } from '../domain/ports/product.repository';
import type { SupplierRepository } from '../domain/ports/supplier.repository';
import type { WarehouseRepository } from '../domain/ports/warehouse.repository';
import { BankAccountsUseCases } from './bank-accounts.use-cases';
import { CategoriesUseCases } from './categories.use-cases';
import { CustomersUseCases } from './customers.use-cases';
import { ProductsUseCases } from './products.use-cases';
import { SuppliersUseCases } from './suppliers.use-cases';
import { WarehousesUseCases } from './warehouses.use-cases';

const ADMIN: ActingUser = { id: 'admin', name: 'Administrador' };
const RUC = '20123456789';

class ImmediateUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => `${entry.action} ${entry.reference}`);
  }
}

class MemoryUnseen implements UnseenRecords {
  readonly created: string[] = [];
  readonly forgotten: string[] = [];

  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    this.created.push(`${resource}/${recordId} by ${authorId}`);
    return Promise.resolve();
  }

  forget(resource: ResourceKey, recordId: string): Promise<void> {
    this.forgotten.push(`${resource}/${recordId}`);
    return Promise.resolve();
  }
}

class MemorySequence implements SequenceGenerator {
  private readonly counters = new Map<string, number>();

  next(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return Promise.resolve(value);
  }
}

class MemoryStock implements StockLedger {
  readonly initialized: string[] = [];

  move(): Promise<StockBalance> {
    return Promise.reject(new Error('not used'));
  }

  initializeForProduct(productId: string): Promise<void> {
    this.initialized.push(`producto ${productId}`);
    return Promise.resolve();
  }

  initializeForWarehouse(warehouseId: string): Promise<void> {
    this.initialized.push(`almacén ${warehouseId}`);
    return Promise.resolve();
  }
}

class MemoryMaster<R extends MasterRecord, F extends StatusFilter> implements MasterRepository<
  R,
  F
> {
  readonly rows = new Map<string, R>();
  readonly inUse = new Set<string>();
  lastCriteria: (ListCriteria & F) | undefined;
  private sequence = 0;

  constructor(private readonly prefix: string) {}

  list(criteria: ListCriteria & F): Promise<ListResult<R>> {
    this.lastCriteria = criteria;
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<R | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  setStatus(id: string, status: ActiveStatus): Promise<R> {
    return Promise.resolve(this.save({ ...this.current(id), status }));
  }

  isInUse(id: string): Promise<boolean> {
    return Promise.resolve(this.inUse.has(id));
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  protected nextId(): string {
    this.sequence += 1;
    return `${this.prefix}${String(this.sequence)}`;
  }

  protected current(id: string): R {
    const row = this.rows.get(id);
    if (row === undefined) {
      throw new Error(`missing ${id}`);
    }
    return row;
  }

  protected save(record: R): R {
    this.rows.set(record.id, record);
    return record;
  }

  protected some(match: (row: R) => boolean, exceptId?: string): Promise<boolean> {
    return Promise.resolve(
      [...this.rows.values()].some((row) => row.id !== exceptId && match(row)),
    );
  }
}

class MemoryCustomers
  extends MemoryMaster<CustomerRecord, CustomerFilter>
  implements CustomerRepository
{
  isDocumentTaken(documentNumber: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.documentNumber === documentNumber, exceptId);
  }

  create(code: string, values: CustomerValues): Promise<CustomerRecord> {
    return Promise.resolve(this.save({ ...values, id: this.nextId(), code }));
  }

  update(id: string, values: CustomerValues): Promise<CustomerRecord> {
    return Promise.resolve(this.save({ ...this.current(id), ...values }));
  }
}

class MemorySuppliers
  extends MemoryMaster<SupplierRecord, StatusFilter>
  implements SupplierRepository
{
  isRucTaken(ruc: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.ruc === ruc, exceptId);
  }

  create(code: string, values: SupplierValues): Promise<SupplierRecord> {
    return Promise.resolve(this.save({ ...values, id: this.nextId(), code }));
  }

  update(id: string, values: SupplierValues): Promise<SupplierRecord> {
    return Promise.resolve(this.save({ ...this.current(id), ...values }));
  }
}

class MemoryCategories
  extends MemoryMaster<CategoryRecord, StatusFilter>
  implements CategoryRepository
{
  isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.name === name, exceptId);
  }

  create(code: string, values: CategoryValues): Promise<CategoryRecord> {
    return Promise.resolve(this.save({ ...values, id: this.nextId(), code }));
  }

  update(id: string, values: CategoryValues): Promise<CategoryRecord> {
    return Promise.resolve(this.save({ ...this.current(id), ...values }));
  }
}

class MemoryWarehouses
  extends MemoryMaster<WarehouseRecord, StatusFilter>
  implements WarehouseRepository
{
  isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.name === name, exceptId);
  }

  create(code: string, values: WarehouseValues): Promise<WarehouseRecord> {
    return Promise.resolve(this.save({ ...values, id: this.nextId(), code }));
  }

  update(id: string, values: WarehouseValues): Promise<WarehouseRecord> {
    return Promise.resolve(this.save({ ...this.current(id), ...values }));
  }
}

class MemoryProducts
  extends MemoryMaster<ProductRecord, ProductFilter>
  implements ProductRepository
{
  readonly synced: string[] = [];
  readonly categories = new Map<string, CategoryReference & { readonly name: string }>([
    ['cat-1', { id: 'cat-1', name: 'Ferretería', status: 'active' }],
  ]);

  isSkuTaken(sku: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.sku === sku, exceptId);
  }

  findCategory(id: string): Promise<CategoryReference | null> {
    return Promise.resolve(this.categories.get(id) ?? null);
  }

  create(values: ProductValues): Promise<ProductRecord> {
    return Promise.resolve(
      this.save({ ...values, id: this.nextId(), categoryName: this.categoryName(values) }),
    );
  }

  update(id: string, values: ProductValues): Promise<ProductRecord> {
    return Promise.resolve(
      this.save({ ...this.current(id), ...values, categoryName: this.categoryName(values) }),
    );
  }

  syncMinStock(id: string, minStock: number): Promise<void> {
    this.synced.push(`${id}=${String(minStock)}`);
    return Promise.resolve();
  }

  private categoryName(values: ProductValues): string {
    return this.categories.get(values.categoryId)?.name ?? '';
  }
}

class MemoryBankAccounts
  extends MemoryMaster<BankAccountRecord, StatusFilter>
  implements BankAccountRepository
{
  isAccountNumberTaken(accountNumber: string, exceptId?: string): Promise<boolean> {
    return this.some((row) => row.accountNumber === accountNumber, exceptId);
  }

  create(values: BankAccountValues): Promise<BankAccountRecord> {
    return Promise.resolve(this.save({ ...values, id: this.nextId() }));
  }

  update(id: string, changes: BankAccountChanges): Promise<BankAccountRecord> {
    return Promise.resolve(this.save({ ...this.current(id), ...changes }));
  }
}

function ports() {
  return {
    uow: new ImmediateUnitOfWork(),
    audit: new MemoryAudit(),
    unseen: new MemoryUnseen(),
    sequence: new MemorySequence(),
    stock: new MemoryStock(),
  };
}

function customers() {
  const p = ports();
  const repo = new MemoryCustomers('cli-');
  const useCases = new CustomersUseCases(p.uow, p.audit, p.unseen, repo, p.sequence);
  return { ...p, repo, useCases };
}

const CUSTOMER = { name: 'Comercial Andina', documentType: 'RUC', documentNumber: RUC };

describe('MasterUseCases (through CustomersUseCases)', () => {
  it('creates with the next code, marks it unseen and audits it', async () => {
    const { useCases, audit, unseen } = customers();
    const record = await useCases.create(CUSTOMER, ADMIN);
    expect(record).toMatchObject({ id: 'cli-1', code: 'CLI-0001', status: 'active' });
    expect(unseen.created).toEqual(['clientes/cli-1 by admin']);
    expect(audit.actions()).toEqual([`Registró ${RUC}`]);
    expect(audit.entries[0]).toMatchObject({ module: 'maestros', resource: 'clientes' });
    await expect(useCases.create(CUSTOMER, ADMIN)).rejects.toThrow(BusinessError);
  });

  it('updates merging the patch with the stored record', async () => {
    const { useCases, audit } = customers();
    await useCases.create(CUSTOMER, ADMIN);
    const updated = await useCases.update('cli-1', { phone: '999 111 222' }, ADMIN);
    expect(updated).toMatchObject({
      name: 'Comercial Andina',
      phone: '999 111 222',
      code: 'CLI-0001',
    });
    expect(audit.actions()).toEqual([`Registró ${RUC}`, `Actualizó ${RUC}`]);
    await expect(useCases.update('nada', {}, ADMIN)).rejects.toThrow(NotFoundError);
  });

  it('lists with its filters and tells whether the list is paged', async () => {
    const { useCases, repo } = customers();
    await useCases.create(CUSTOMER, ADMIN);
    const result = await useCases.list({ q: 'andina', status: 'active', documentType: 'RUC' });
    expect(result).toMatchObject({ total: 1, paged: false });
    expect(repo.lastCriteria).toMatchObject({ q: 'andina', status: 'active', documentType: 'RUC' });
    await expect(useCases.list({ page: 1 })).resolves.toMatchObject({ paged: true });
    await expect(useCases.get('cli-1')).resolves.toMatchObject({ code: 'CLI-0001' });
    await expect(useCases.get('nada')).rejects.toThrow(NotFoundError);
  });

  it('removes a free record and refuses one in use', async () => {
    const { useCases, repo, audit, unseen } = customers();
    await useCases.create(CUSTOMER, ADMIN);
    repo.inUse.add('cli-1');
    await expect(useCases.remove('cli-1', ADMIN)).rejects.toThrow(CUSTOMER_IN_USE);
    repo.inUse.clear();
    await useCases.remove('cli-1', ADMIN);
    expect(repo.rows.size).toBe(0);
    expect(unseen.forgotten).toEqual(['clientes/cli-1']);
    expect(audit.actions()).toEqual([`Registró ${RUC}`, `Eliminó ${RUC}`]);
    await expect(useCases.remove('cli-1', ADMIN)).rejects.toThrow(NotFoundError);
  });

  it('runs the activation actions of the catalog', async () => {
    const { useCases, audit } = customers();
    await useCases.create(CUSTOMER, ADMIN);
    await expect(useCases.runAction('cli-1', 'deactivate', ADMIN)).resolves.toMatchObject({
      status: 'inactive',
    });
    await expect(useCases.runAction('cli-1', 'deactivate', ADMIN)).rejects.toThrow(
      'El registro ya está inactivo.',
    );
    await expect(useCases.runAction('cli-1', 'activate', ADMIN)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(useCases.runAction('cli-1', 'archivar', ADMIN)).rejects.toThrow(UNKNOWN_ACTION);
    await expect(useCases.runAction('nada', 'activate', ADMIN)).rejects.toThrow(NotFoundError);
    expect(audit.actions()).toEqual([`Registró ${RUC}`, `Desactivó ${RUC}`, `Activó ${RUC}`]);
  });
});

describe('SuppliersUseCases', () => {
  it('creates, updates and lists suppliers by code', async () => {
    const p = ports();
    const repo = new MemorySuppliers('prv-');
    const useCases = new SuppliersUseCases(p.uow, p.audit, p.unseen, repo, p.sequence);
    await expect(useCases.create({ name: 'Aceros', ruc: RUC }, ADMIN)).resolves.toMatchObject({
      code: 'PRV-0001',
    });
    await expect(useCases.update('prv-1', { paymentDays: 30 }, ADMIN)).resolves.toMatchObject({
      ruc: RUC,
      paymentDays: 30,
    });
    await useCases.list({ status: 'inactive' });
    expect(repo.lastCriteria).toMatchObject({ status: 'inactive' });
    expect(p.audit.actions()).toEqual(['Registró PRV-0001', 'Actualizó PRV-0001']);
  });
});

describe('CategoriesUseCases', () => {
  it('creates and updates categories by code', async () => {
    const p = ports();
    const repo = new MemoryCategories('cat-');
    const useCases = new CategoriesUseCases(p.uow, p.audit, p.unseen, repo, p.sequence);
    await expect(useCases.create({ name: 'Ferretería' }, ADMIN)).resolves.toMatchObject({
      code: 'CAT-001',
    });
    await expect(
      useCases.update('cat-1', { description: 'Clavos y tornillos' }, ADMIN),
    ).resolves.toMatchObject({ name: 'Ferretería', description: 'Clavos y tornillos' });
    await useCases.list({ status: 'active' });
    expect(repo.lastCriteria).toMatchObject({ status: 'active' });
    expect(p.audit.actions()).toEqual(['Registró CAT-001', 'Actualizó CAT-001']);
  });
});

describe('WarehousesUseCases', () => {
  it('creates a warehouse with its stock rows and updates it', async () => {
    const p = ports();
    const repo = new MemoryWarehouses('alm-');
    const useCases = new WarehousesUseCases(p.uow, p.audit, p.unseen, repo, p.sequence, p.stock);
    await expect(useCases.create({ name: 'Central' }, ADMIN)).resolves.toMatchObject({
      code: 'ALM-01',
    });
    expect(p.stock.initialized).toEqual(['almacén alm-1']);
    await expect(useCases.update('alm-1', { manager: 'Ana' }, ADMIN)).resolves.toMatchObject({
      name: 'Central',
      manager: 'Ana',
    });
    await useCases.list({});
    expect(repo.lastCriteria).toMatchObject({ status: undefined });
    expect(p.audit.actions()).toEqual(['Registró ALM-01', 'Actualizó ALM-01']);
  });
});

describe('ProductsUseCases', () => {
  const PRODUCT = {
    sku: 'tor-01',
    name: 'Tornillo',
    categoryId: 'cat-1',
    unit: 'UND',
    salePrice: 2,
  };

  function products() {
    const p = ports();
    const repo = new MemoryProducts('prd-');
    const useCases = new ProductsUseCases(p.uow, p.audit, p.unseen, repo, p.stock);
    return { ...p, repo, useCases };
  }

  it('creates a product with its stock rows', async () => {
    const { useCases, stock, audit } = products();
    await expect(useCases.create(PRODUCT, ADMIN)).resolves.toMatchObject({
      id: 'prd-1',
      sku: 'TOR-01',
      categoryName: 'Ferretería',
    });
    expect(stock.initialized).toEqual(['producto prd-1']);
    expect(audit.actions()).toEqual(['Registró TOR-01']);
  });

  it('copies the minimum stock to the stock rows only when it changes', async () => {
    const { useCases, repo } = products();
    await useCases.create(PRODUCT, ADMIN);
    await useCases.update('prd-1', { name: 'Tornillo 1/2' }, ADMIN);
    expect(repo.synced).toEqual([]);
    await expect(useCases.update('prd-1', { minStock: 10 }, ADMIN)).resolves.toMatchObject({
      name: 'Tornillo 1/2',
      minStock: 10,
    });
    expect(repo.synced).toEqual(['prd-1=10']);
  });

  it('lists by category', async () => {
    const { useCases, repo } = products();
    await useCases.list({ categoryId: 'cat-1', status: 'active' });
    expect(repo.lastCriteria).toMatchObject({ categoryId: 'cat-1', status: 'active' });
  });
});

describe('BankAccountsUseCases', () => {
  it('opens and edits an account without touching its balance', async () => {
    const p = ports();
    const repo = new MemoryBankAccounts('cta-');
    const useCases = new BankAccountsUseCases(p.uow, p.audit, p.unseen, repo);
    await expect(
      useCases.create(
        { bank: 'BCP', name: 'Soles', accountNumber: '191-1', openingBalance: 500 },
        ADMIN,
      ),
    ).resolves.toMatchObject({ id: 'cta-1', balance: 500 });
    await expect(
      useCases.update('cta-1', { name: 'Soles principal', openingBalance: 0 }, ADMIN),
    ).resolves.toMatchObject({ name: 'Soles principal', openingBalance: 500, balance: 500 });
    await useCases.list({ status: 'active' });
    expect(repo.lastCriteria).toMatchObject({ status: 'active' });
    expect(p.audit.actions()).toEqual(['Registró Soles', 'Actualizó Soles principal']);
  });
});
