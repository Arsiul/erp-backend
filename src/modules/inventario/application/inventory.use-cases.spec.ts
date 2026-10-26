import type { ActingUser } from '../../../shared/application/listing/list-query';
import { UNKNOWN_ACTION } from '../../../shared/application/listing/resource-actions';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { Money } from '../../../shared/domain/money/money';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type { SequenceGenerator } from '../../../shared/domain/ports/sequence-generator.port';
import type {
  StockBalance,
  StockLedger,
  StockMovement,
} from '../../../shared/domain/ports/stock-ledger.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import type {
  AdjustmentRecord,
  AdjustmentValues,
  KardexRecord,
  StockRecord,
  TransferRecord,
  TransferStatus,
  TransferValues,
} from '../domain/inventory';
import type {
  CatalogProduct,
  CatalogWarehouse,
  InventoryCatalog,
  StockLevel,
} from '../domain/ports/inventory-catalog';
import type {
  AdjustmentCriteria,
  AdjustmentRepository,
  KardexCriteria,
  KardexRepository,
  StockCriteria,
  StockRepository,
  TransferCriteria,
  TransferRepository,
} from '../domain/ports/inventory.repositories';
import { AdjustmentsUseCases } from './adjustments.use-cases';
import { KardexQueries } from './kardex.queries';
import { StockUseCases } from './stock.use-cases';
import { TransfersUseCases } from './transfers.use-cases';

const ADMIN: ActingUser = { id: 'admin', name: 'Administrador' };
const TODAY = '2026-10-25';

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
    return this.entries.map((entry) => `${entry.resource} ${entry.action} ${entry.reference}`);
  }
}

class MemoryUnseen implements UnseenRecords {
  readonly created: string[] = [];

  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    this.created.push(`${resource}/${recordId} by ${authorId}`);
    return Promise.resolve();
  }

  forget(): Promise<void> {
    return Promise.resolve();
  }
}

class MemorySequences implements SequenceGenerator {
  private readonly counters = new Map<string, number>();

  next(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return Promise.resolve(value);
  }
}

const FIXED_CLOCK: Clock = { now: () => new Date('2026-10-25T15:00:00Z') };

class MemoryCatalog implements InventoryCatalog {
  readonly products = new Map<string, CatalogProduct>();
  readonly warehouses = new Map<string, CatalogWarehouse>();
  readonly stock = new Map<string, StockLevel>();

  findProduct(id: string): Promise<CatalogProduct | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  findWarehouse(id: string): Promise<CatalogWarehouse | null> {
    return Promise.resolve(this.warehouses.get(id) ?? null);
  }

  findStock(productId: string, warehouseId: string): Promise<StockLevel | null> {
    return Promise.resolve(this.stock.get(`${productId}|${warehouseId}`) ?? null);
  }
}

/** Moves the catalog stock like the Prisma ledger does, so the rules read the new balances. */
class MemoryLedger implements StockLedger {
  readonly movements: StockMovement[] = [];

  constructor(private readonly catalog: MemoryCatalog) {}

  move(movement: StockMovement): Promise<StockBalance> {
    const key = `${movement.productId}|${movement.warehouseId}`;
    const current = this.catalog.stock.get(key) ?? { quantity: 0, unitCost: Money.zero() };
    const quantity = current.quantity + movement.quantity;
    if (quantity < 0) {
      return Promise.reject(new BusinessError('Stock insuficiente.'));
    }
    const balance = { quantity, unitCost: movement.unitCost ?? current.unitCost };
    this.catalog.stock.set(key, balance);
    this.movements.push(movement);
    return Promise.resolve(balance);
  }

  initializeForProduct(): Promise<void> {
    return Promise.resolve();
  }

  initializeForWarehouse(): Promise<void> {
    return Promise.resolve();
  }
}

class MemoryList<T extends { readonly id: string }, C> {
  readonly rows = new Map<string, T>();
  lastCriteria: C | undefined;

  list(criteria: C): Promise<ListResult<T>> {
    this.lastCriteria = criteria;
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<T | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  protected save(row: T): Promise<T> {
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
}

function present<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Missing row');
  }
  return value;
}

class MemoryStock extends MemoryList<StockRecord, StockCriteria> implements StockRepository {
  setMinStock(id: string, minStock: number): Promise<StockRecord> {
    return this.save({ ...present(this.rows.get(id)), minStock });
  }
}

class MemoryKardex extends MemoryList<KardexRecord, KardexCriteria> implements KardexRepository {}

class MemoryAdjustments
  extends MemoryList<AdjustmentRecord, AdjustmentCriteria>
  implements AdjustmentRepository
{
  create(values: AdjustmentValues): Promise<AdjustmentRecord> {
    return this.save({ ...values, id: `aj-${String(this.rows.size + 1)}` });
  }
}

class MemoryTransfers
  extends MemoryList<TransferRecord, TransferCriteria>
  implements TransferRepository
{
  locks = 0;

  lockById(id: string): Promise<TransferRecord | null> {
    this.locks += 1;
    return this.findById(id);
  }

  create(number: string, values: TransferValues): Promise<TransferRecord> {
    return this.save({
      ...values,
      id: `tr-${String(this.rows.size + 1)}`,
      number,
      status: 'pending',
    });
  }

  update(id: string, values: TransferValues): Promise<TransferRecord> {
    return this.save({ ...present(this.rows.get(id)), ...values });
  }

  setStatus(id: string, status: TransferStatus): Promise<TransferRecord> {
    return this.save({ ...present(this.rows.get(id)), status });
  }
}

function setup() {
  const catalog = new MemoryCatalog();
  catalog.products.set('p1', {
    id: 'p1',
    name: 'Laptop',
    sku: 'LAP-1',
    unit: 'und',
    status: 'active',
  });
  catalog.products.set('p2', {
    id: 'p2',
    name: 'Mouse',
    sku: 'MOU-1',
    unit: 'und',
    status: 'inactive',
  });
  catalog.warehouses.set('w1', { id: 'w1', name: 'Central', status: 'active' });
  catalog.warehouses.set('w2', { id: 'w2', name: 'Norte', status: 'active' });
  catalog.warehouses.set('w3', { id: 'w3', name: 'Sur', status: 'inactive' });
  catalog.stock.set('p1|w1', { quantity: 10, unitCost: Money.of('25.50') });
  const ledger = new MemoryLedger(catalog);
  const audit = new MemoryAudit();
  const unseen = new MemoryUnseen();
  const sequences = new MemorySequences();
  const uow = new ImmediateUnitOfWork();
  const stockRepo = new MemoryStock();
  const kardexRepo = new MemoryKardex();
  const adjustmentRepo = new MemoryAdjustments();
  const transferRepo = new MemoryTransfers();
  return {
    catalog,
    ledger,
    audit,
    unseen,
    stockRepo,
    kardexRepo,
    adjustmentRepo,
    transferRepo,
    stock: new StockUseCases(uow, stockRepo, audit),
    kardex: new KardexQueries(kardexRepo),
    adjustments: new AdjustmentsUseCases(
      uow,
      adjustmentRepo,
      catalog,
      ledger,
      sequences,
      FIXED_CLOCK,
      audit,
      unseen,
    ),
    transfers: new TransfersUseCases(
      uow,
      transferRepo,
      catalog,
      ledger,
      sequences,
      FIXED_CLOCK,
      audit,
      unseen,
    ),
  };
}

const STOCK_ROW: StockRecord = {
  id: 's1',
  productId: 'p1',
  productName: 'Laptop',
  sku: 'LAP-1',
  categoryName: 'Equipos',
  unit: 'und',
  warehouseId: 'w1',
  warehouseName: 'Central',
  quantity: 10,
  minStock: 2,
  unitCost: Money.of('25.50'),
};

const KARDEX_ROW: KardexRecord = {
  id: 'k1',
  date: TODAY,
  productId: 'p1',
  productName: 'Laptop',
  sku: 'LAP-1',
  warehouseId: 'w1',
  warehouseName: 'Central',
  origin: 'initial',
  reference: 'Saldo inicial',
  quantity: 10,
  balance: 10,
  unitCost: Money.of('25.50'),
};

const TRANSFER_INPUT = {
  productId: 'p1',
  originWarehouseId: 'w1',
  destinationWarehouseId: 'w2',
  quantity: 4,
};

describe('StockUseCases', () => {
  it('lists with the filters and serializes the cost as a number', async () => {
    const { stock, stockRepo } = setup();
    stockRepo.rows.set('s1', STOCK_ROW);
    const result = await stock.list({ q: 'lap', productId: 'p1', warehouseId: 'w1', page: 1 });
    expect(result).toMatchObject({ total: 1, paged: true, items: [{ id: 's1', unitCost: 25.5 }] });
    expect(stockRepo.lastCriteria).toMatchObject({ q: 'lap', productId: 'p1', warehouseId: 'w1' });
    expect((await stock.list({})).paged).toBe(false);
  });

  it('gets a row or fails with not found', async () => {
    const { stock, stockRepo } = setup();
    stockRepo.rows.set('s1', STOCK_ROW);
    await expect(stock.get('s1')).resolves.toMatchObject({ quantity: 10 });
    await expect(stock.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('only edits the minimum stock and audits it', async () => {
    const { stock, stockRepo, audit } = setup();
    stockRepo.rows.set('s1', STOCK_ROW);
    await expect(stock.update('s1', { minStock: '5' }, ADMIN)).resolves.toMatchObject({
      minStock: 5,
      quantity: 10,
    });
    await expect(stock.update('s1', {}, ADMIN)).resolves.toMatchObject({ minStock: 5 });
    await expect(stock.update('s1', { minStock: 1.5 }, ADMIN)).rejects.toThrow(
      'El stock mínimo debe ser un entero desde 0.',
    );
    await expect(stock.update('nope', { minStock: 1 }, ADMIN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(audit.actions()).toEqual([
      'stock Actualizó Laptop · Central',
      'stock Actualizó Laptop · Central',
    ]);
    expect(audit.entries[0]).toMatchObject({ module: 'inventario', actor: { userId: 'admin' } });
  });
});

describe('KardexQueries', () => {
  it('lists with the filters and gets one entry', async () => {
    const { kardex, kardexRepo } = setup();
    kardexRepo.rows.set('k1', KARDEX_ROW);
    const result = await kardex.list({ productId: 'p1', warehouseId: 'w1', origin: 'initial' });
    expect(result).toMatchObject({ total: 1, paged: false, items: [{ unitCost: 25.5 }] });
    expect(kardexRepo.lastCriteria).toMatchObject({ origin: 'initial', warehouseId: 'w1' });
    expect((await kardex.list({ page: 2 })).paged).toBe(true);
    await expect(kardex.get('k1')).resolves.toMatchObject({ balance: 10 });
    await expect(kardex.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('AdjustmentsUseCases', () => {
  const INPUT = {
    productId: 'p1',
    warehouseId: 'w1',
    type: 'decrease',
    quantity: 3,
    reason: 'damage',
  };

  it('creates a numbered adjustment and moves the stock', async () => {
    const { adjustments, ledger, catalog, unseen, audit } = setup();
    const created = await adjustments.create({ ...INPUT, notes: '  golpe ' }, ADMIN);
    expect(created).toMatchObject({
      number: 'AJ-00001',
      date: TODAY,
      productName: 'Laptop',
      sku: 'LAP-1',
      warehouseName: 'Central',
      type: 'decrease',
      quantity: 3,
      notes: 'golpe',
    });
    expect(ledger.movements).toEqual([
      {
        productId: 'p1',
        warehouseId: 'w1',
        quantity: -3,
        origin: 'adjustment',
        reference: 'AJ-00001',
        date: TODAY,
      },
    ]);
    expect(catalog.stock.get('p1|w1')?.quantity).toBe(7);
    const second = await adjustments.create(
      { ...INPUT, type: 'increase', reason: 'other', notes: 'Recuento', date: '2026-10-20' },
      ADMIN,
    );
    expect(second).toMatchObject({ number: 'AJ-00002', date: '2026-10-20' });
    expect(catalog.stock.get('p1|w1')?.quantity).toBe(10);
    expect(unseen.created).toEqual(['ajustes/aj-1 by admin', 'ajustes/aj-2 by admin']);
    expect(audit.actions()).toEqual(['ajustes Registró AJ-00001', 'ajustes Registró AJ-00002']);
  });

  it.each([
    [{ productId: '' }, 'Selecciona el producto.'],
    [{ productId: 'p2' }, 'No puedes usar el producto porque está en estado inactivo.'],
    [{ warehouseId: 'w9' }, 'Selecciona el almacén.'],
    [{ warehouseId: 'w3' }, 'No puedes usar el almacén porque está en estado inactivo.'],
    [{ type: 'x' }, 'Elige si el ajuste suma o resta.'],
    [{ quantity: 0 }, 'La cantidad debe ser un entero mayor que cero.'],
    [{ quantity: 'abc' }, 'La cantidad debe ser un entero mayor que cero.'],
    [{ reason: '' }, 'Elige el motivo.'],
    [{ reason: 'other' }, 'Explica el motivo del ajuste en las notas.'],
    [{ date: '2026-02-30' }, 'La fecha no es válida.'],
    [{ quantity: 11 }, 'Stock insuficiente.'],
  ])('rejects %o', async (patch, message) => {
    const { adjustments, adjustmentRepo } = setup();
    await expect(adjustments.create({ ...INPUT, ...patch }, ADMIN)).rejects.toThrow(message);
    expect(adjustmentRepo.rows.size).toBe(0);
  });

  it('lists with the filters and gets one adjustment', async () => {
    const { adjustments, adjustmentRepo } = setup();
    const created = await adjustments.create(INPUT, ADMIN);
    const result = await adjustments.list({ type: 'decrease', reason: 'damage', page: 1 });
    expect(result).toMatchObject({ total: 1, paged: true });
    expect(adjustmentRepo.lastCriteria).toMatchObject({ type: 'decrease', reason: 'damage' });
    expect((await adjustments.list({ productId: 'p1', warehouseId: 'w1' })).paged).toBe(false);
    await expect(adjustments.get(created.id)).resolves.toEqual(created);
    await expect(adjustments.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TransfersUseCases', () => {
  it('creates a pending transfer without moving stock', async () => {
    const { transfers, ledger, unseen, audit } = setup();
    const created = await transfers.create({ ...TRANSFER_INPUT, notes: ' urgente ' }, ADMIN);
    expect(created).toMatchObject({
      number: 'TR-00001',
      date: TODAY,
      status: 'pending',
      originWarehouseName: 'Central',
      destinationWarehouseName: 'Norte',
      productName: 'Laptop',
      notes: 'urgente',
    });
    expect(ledger.movements).toEqual([]);
    expect(unseen.created).toEqual(['transferencias/tr-1 by admin']);
    expect(audit.actions()).toEqual(['transferencias Registró TR-00001']);
  });

  it.each([
    [
      { originWarehouseId: 'w2', destinationWarehouseId: 'w2' },
      'El origen y el destino deben ser almacenes distintos.',
    ],
    [
      { destinationWarehouseId: 'w3' },
      'No puedes usar el almacén de destino porque está en estado inactivo.',
    ],
    [{ originWarehouseId: undefined }, 'Selecciona el almacén de origen.'],
    [{ quantity: 2.5 }, 'La cantidad debe ser un entero mayor que cero.'],
    [{ quantity: 11 }, 'En Central solo hay 10 und de Laptop.'],
    [
      { originWarehouseId: 'w2', destinationWarehouseId: 'w1' },
      'En Norte solo hay 0 und de Laptop.',
    ],
  ])('rejects %o', async (patch, message) => {
    const { transfers } = setup();
    await expect(transfers.create({ ...TRANSFER_INPUT, ...patch }, ADMIN)).rejects.toThrow(message);
  });

  it('edits a pending transfer merging the current values', async () => {
    const { transfers, transferRepo, audit } = setup();
    const created = await transfers.create(TRANSFER_INPUT, ADMIN);
    const updated = await transfers.update(created.id, { quantity: 6, notes: 'Cambio' }, ADMIN);
    expect(updated).toMatchObject({ quantity: 6, notes: 'Cambio', destinationWarehouseId: 'w2' });
    expect(transferRepo.locks).toBe(1);
    expect(audit.actions()).toContain('transferencias Actualizó TR-00001');
    await expect(transfers.update('nope', {}, ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('completes a transfer moving the units at the origin cost', async () => {
    const { transfers, ledger, catalog, audit } = setup();
    const created = await transfers.create(TRANSFER_INPUT, ADMIN);
    const completed = await transfers.runAction(created.id, 'complete', ADMIN);
    expect(completed.status).toBe('completed');
    expect(ledger.movements).toEqual([
      expect.objectContaining({
        warehouseId: 'w1',
        quantity: -4,
        origin: 'transfer',
        reference: 'TR-00001',
        date: TODAY,
      }),
      expect.objectContaining({ warehouseId: 'w2', quantity: 4, unitCost: Money.of('25.50') }),
    ]);
    expect(catalog.stock.get('p1|w1')?.quantity).toBe(6);
    expect(catalog.stock.get('p1|w2')).toEqual({ quantity: 4, unitCost: Money.of('25.50') });
    expect(audit.actions()).toContain('transferencias Completó TR-00001');
    await expect(transfers.runAction(created.id, 'complete', ADMIN)).rejects.toThrow(
      'La transferencia ya está cerrada.',
    );
    await expect(transfers.runAction(created.id, 'cancel', ADMIN)).rejects.toThrow(
      'Solo se anulan transferencias pendientes.',
    );
    await expect(transfers.update(created.id, {}, ADMIN)).rejects.toThrow(
      'Solo se editan transferencias pendientes.',
    );
  });

  it('cancels a pending transfer without touching stock', async () => {
    const { transfers, ledger, audit } = setup();
    const created = await transfers.create(TRANSFER_INPUT, ADMIN);
    await expect(transfers.runAction(created.id, 'cancel', ADMIN)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(ledger.movements).toEqual([]);
    expect(audit.actions()).toContain('transferencias Anuló TR-00001');
  });

  it('rechecks the destination and the origin stock when completing', async () => {
    const { transfers, catalog } = setup();
    const created = await transfers.create(TRANSFER_INPUT, ADMIN);
    catalog.warehouses.set('w2', { id: 'w2', name: 'Norte', status: 'inactive' });
    await expect(transfers.runAction(created.id, 'complete', ADMIN)).rejects.toThrow(
      'No puedes usar el almacén de destino porque está en estado inactivo.',
    );
    catalog.warehouses.set('w2', { id: 'w2', name: 'Norte', status: 'active' });
    catalog.stock.delete('p1|w1');
    await expect(transfers.runAction(created.id, 'complete', ADMIN)).rejects.toThrow(
      'Selecciona el stock de origen.',
    );
    catalog.stock.set('p1|w1', { quantity: 1, unitCost: Money.of('25.50') });
    await expect(transfers.runAction(created.id, 'complete', ADMIN)).rejects.toThrow(
      'Stock insuficiente.',
    );
  });

  it('rejects unknown actions and missing transfers', async () => {
    const { transfers } = setup();
    await expect(transfers.runAction('tr-1', 'void', ADMIN)).rejects.toThrow(UNKNOWN_ACTION);
    await expect(transfers.runAction('nope', 'cancel', ADMIN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('lists with the filters and gets one transfer', async () => {
    const { transfers, transferRepo } = setup();
    const created = await transfers.create(TRANSFER_INPUT, ADMIN);
    const result = await transfers.list({ status: 'pending', productId: 'p1', warehouseId: 'w2' });
    expect(result).toMatchObject({ total: 1, paged: false });
    expect(transferRepo.lastCriteria).toMatchObject({ status: 'pending', warehouseId: 'w2' });
    expect((await transfers.list({ page: 1 })).paged).toBe(true);
    await expect(transfers.get(created.id)).resolves.toEqual(created);
    await expect(transfers.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
