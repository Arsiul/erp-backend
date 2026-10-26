import type { ResourceKey } from '../../../src/shared/domain/authorization/resources';
import type { ListResult } from '../../../src/shared/domain/listing/list-criteria';
import { Money } from '../../../src/shared/domain/money/money';
import type { AuditEntry, AuditLogger } from '../../../src/shared/domain/ports/audit-logger.port';
import type { Clock } from '../../../src/shared/domain/ports/clock.port';
import type { SequenceGenerator } from '../../../src/shared/domain/ports/sequence-generator.port';
import type {
  StockBalance,
  StockLedger,
  StockMovement,
} from '../../../src/shared/domain/ports/stock-ledger.port';
import type { UnitOfWork } from '../../../src/shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../src/shared/domain/ports/unseen-records.port';
import type { ActingUser } from '../../../src/shared/application/listing/list-query';
import { PayablesUseCases } from '../../../src/modules/compras/application/payables.use-cases';
import { PurchaseOrdersUseCases } from '../../../src/modules/compras/application/purchase-orders.use-cases';
import { ReceiptsUseCases } from '../../../src/modules/compras/application/receipts.use-cases';
import { SupplierInvoicesUseCases } from '../../../src/modules/compras/application/supplier-invoices.use-cases';
import type { PayableRecord, PayableValues } from '../../../src/modules/compras/domain/payable';
import type {
  CatalogProduct,
  CatalogSupplier,
  CatalogWarehouse,
  PurchasingCatalog,
} from '../../../src/modules/compras/domain/ports/purchasing-catalog.port';
import type {
  PayableCriteria,
  PayableRepository,
  PurchaseOrderCriteria,
  PurchaseOrderRepository,
  ReceiptCriteria,
  ReceiptRepository,
  SupplierInvoiceCriteria,
  SupplierInvoiceRepository,
} from '../../../src/modules/compras/domain/ports/purchasing.repositories';
import type {
  PurchaseLine,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  PurchaseOrderValues,
} from '../../../src/modules/compras/domain/purchase-order';
import type {
  ReceiptRecord,
  ReceiptStatus,
  ReceiptValues,
} from '../../../src/modules/compras/domain/receipt';
import type {
  SupplierInvoiceRecord,
  SupplierInvoiceValues,
} from '../../../src/modules/compras/domain/supplier-invoice';

export const BUYER: ActingUser = { id: 'u-buyer', name: 'Comprador' };
/** 10:00 in Lima on 2026-10-25. */
export const NOW = new Date('2026-10-25T15:00:00Z');
export const TODAY = '2026-10-25';

function missing(id: string): never {
  throw new Error(`missing ${id}`);
}

function stored<T>(map: Map<string, T>, id: string): T {
  return map.get(id) ?? missing(id);
}

const page = <T>(items: readonly T[]): ListResult<T> => ({ items, total: items.length });

/** Runs the work and counts the transactions; a rollback restores the sequence counters. */
export class MemoryUnitOfWork implements UnitOfWork {
  runs = 0;

  constructor(private readonly sequences: MemorySequences) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    const snapshot = new Map(this.sequences.counters);
    try {
      return await work();
    } catch (error) {
      this.sequences.counters = snapshot;
      throw error;
    }
  }
}

export class MemorySequences implements SequenceGenerator {
  counters = new Map<string, number>();

  next(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return Promise.resolve(value);
  }
}

export class FixedClock implements Clock {
  now(): Date {
    return NOW;
  }
}

export class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => `${entry.resource} ${entry.action} ${entry.reference}`);
  }
}

export class MemoryUnseen implements UnseenRecords {
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

/** Keeps the balance per product and warehouse; it refuses to go below zero like the real one. */
export class MemoryStock implements StockLedger {
  readonly moves: StockMovement[] = [];
  readonly balances = new Map<string, number>();

  move(movement: StockMovement): Promise<StockBalance> {
    const key = `${movement.productId}@${movement.warehouseId}`;
    const quantity = (this.balances.get(key) ?? 0) + movement.quantity;
    if (quantity < 0) {
      return Promise.reject(new Error('Stock insuficiente'));
    }
    this.balances.set(key, quantity);
    this.moves.push(movement);
    return Promise.resolve({ quantity, unitCost: movement.unitCost ?? Money.zero() });
  }

  initializeForProduct(): Promise<void> {
    return Promise.resolve();
  }

  initializeForWarehouse(): Promise<void> {
    return Promise.resolve();
  }

  balance(productId: string, warehouseId: string): number {
    return this.balances.get(`${productId}@${warehouseId}`) ?? 0;
  }
}

export class MemoryCatalog implements PurchasingCatalog {
  readonly suppliers = new Map<string, CatalogSupplier>([
    ['s1', { id: 's1', name: 'Distribuidora Andina', paymentDays: 30, status: 'active' }],
    ['s2', { id: 's2', name: 'Importaciones Lima', paymentDays: 0, status: 'active' }],
    ['s-off', { id: 's-off', name: 'Proveedor Baja', paymentDays: 15, status: 'inactive' }],
  ]);
  readonly warehouses = new Map<string, CatalogWarehouse>([
    ['w1', { id: 'w1', name: 'Almacén Central', status: 'active' }],
    ['w-off', { id: 'w-off', name: 'Almacén Cerrado', status: 'inactive' }],
  ]);
  readonly products = new Map<string, CatalogProduct>([
    ['p1', { id: 'p1', name: 'Teclado', sku: 'TEC-1', costPrice: Money.of(50), status: 'active' }],
    ['p2', { id: 'p2', name: 'Mouse', sku: 'MOU-1', costPrice: Money.of(20), status: 'active' }],
    ['p3', { id: 'p3', name: 'Monitor', sku: 'MON-1', costPrice: Money.of(400), status: 'active' }],
  ]);
  readonly costPrices: string[] = [];

  findSupplier(id: string): Promise<CatalogSupplier | null> {
    return Promise.resolve(this.suppliers.get(id) ?? null);
  }

  findWarehouse(id: string): Promise<CatalogWarehouse | null> {
    return Promise.resolve(this.warehouses.get(id) ?? null);
  }

  findProducts(ids: readonly string[]): Promise<readonly CatalogProduct[]> {
    return Promise.resolve(ids.flatMap((id) => this.products.get(id) ?? []));
  }

  igvRate(): Promise<number> {
    return Promise.resolve(0.18);
  }

  setCostPrice(productId: string, costPrice: Money): Promise<void> {
    this.costPrices.push(`${productId}=${costPrice.toFixed()}`);
    return Promise.resolve();
  }
}

export class MemoryOrders implements PurchaseOrderRepository {
  readonly rows = new Map<string, PurchaseOrderRecord>();
  lastCriteria: PurchaseOrderCriteria | undefined;
  private ids = 0;

  list(criteria: PurchaseOrderCriteria): Promise<ListResult<PurchaseOrderRecord>> {
    this.lastCriteria = criteria;
    return Promise.resolve(
      page(
        [...this.rows.values()].filter(
          (row) => criteria.status === undefined || row.status === criteria.status,
        ),
      ),
    );
  }

  findById(id: string): Promise<PurchaseOrderRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findForUpdate(id: string): Promise<PurchaseOrderRecord | null> {
    return this.findById(id);
  }

  create(number: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord> {
    this.ids += 1;
    const record: PurchaseOrderRecord = {
      ...values,
      id: `po${String(this.ids)}`,
      number,
      status: 'draft',
      lines: values.lines.map((line) => ({ ...line, receivedQuantity: 0 })),
    };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  update(id: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord> {
    return this.save({
      ...stored(this.rows, id),
      ...values,
      lines: values.lines.map((line) => ({ ...line, receivedQuantity: 0 })),
    });
  }

  setStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrderRecord> {
    return this.save({ ...stored(this.rows, id), status });
  }

  setProgress(
    id: string,
    lines: readonly PurchaseLine[],
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderRecord> {
    return this.save({ ...stored(this.rows, id), lines, status });
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  private save(record: PurchaseOrderRecord): Promise<PurchaseOrderRecord> {
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }
}

export class MemoryReceipts implements ReceiptRepository {
  readonly rows = new Map<string, ReceiptRecord>();
  lastCriteria: ReceiptCriteria | undefined;
  private ids = 0;

  list(criteria: ReceiptCriteria): Promise<ListResult<ReceiptRecord>> {
    this.lastCriteria = criteria;
    return Promise.resolve(page([...this.rows.values()]));
  }

  findById(id: string): Promise<ReceiptRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findForUpdate(id: string): Promise<ReceiptRecord | null> {
    return this.findById(id);
  }

  listByOrder(purchaseOrderId: string): Promise<readonly ReceiptRecord[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.purchaseOrderId === purchaseOrderId),
    );
  }

  create(number: string, values: ReceiptValues): Promise<ReceiptRecord> {
    this.ids += 1;
    const record: ReceiptRecord = {
      ...values,
      id: `rc${String(this.ids)}`,
      number,
      status: 'pending_bill',
      supplierInvoiceNumber: '',
    };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  setGuideNumber(id: string, guideNumber: string): Promise<ReceiptRecord> {
    return this.save({ ...stored(this.rows, id), guideNumber });
  }

  setStatus(
    id: string,
    status: ReceiptStatus,
    supplierInvoiceNumber: string,
  ): Promise<ReceiptRecord> {
    return this.save({ ...stored(this.rows, id), status, supplierInvoiceNumber });
  }

  private save(record: ReceiptRecord): Promise<ReceiptRecord> {
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }
}

export class MemoryInvoices implements SupplierInvoiceRepository {
  readonly rows = new Map<string, SupplierInvoiceRecord>();
  lastCriteria: SupplierInvoiceCriteria | undefined;
  private ids = 0;

  list(criteria: SupplierInvoiceCriteria): Promise<ListResult<SupplierInvoiceRecord>> {
    this.lastCriteria = criteria;
    return Promise.resolve(page([...this.rows.values()]));
  }

  findById(id: string): Promise<SupplierInvoiceRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findForUpdate(id: string): Promise<SupplierInvoiceRecord | null> {
    return this.findById(id);
  }

  existsActive(supplierId: string, documentNumber: string): Promise<boolean> {
    return Promise.resolve(
      [...this.rows.values()].some(
        (row) =>
          row.supplierId === supplierId &&
          row.documentNumber === documentNumber &&
          row.status === 'registered',
      ),
    );
  }

  create(values: SupplierInvoiceValues): Promise<SupplierInvoiceRecord> {
    this.ids += 1;
    const record: SupplierInvoiceRecord = {
      ...values,
      id: `fp${String(this.ids)}`,
      status: 'registered',
    };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  cancel(id: string): Promise<SupplierInvoiceRecord> {
    const record: SupplierInvoiceRecord = { ...stored(this.rows, id), status: 'cancelled' };
    this.rows.set(id, record);
    return Promise.resolve(record);
  }
}

export class MemoryPayables implements PayableRepository {
  readonly rows = new Map<string, PayableRecord>();
  lastCriteria: PayableCriteria | undefined;
  private ids = 0;

  list(criteria: PayableCriteria): Promise<ListResult<PayableRecord>> {
    this.lastCriteria = criteria;
    return Promise.resolve(page([...this.rows.values()]));
  }

  findById(id: string): Promise<PayableRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByInvoiceForUpdate(supplierInvoiceId: string): Promise<PayableRecord | null> {
    return Promise.resolve(
      [...this.rows.values()].find((row) => row.supplierInvoiceId === supplierInvoiceId) ?? null,
    );
  }

  create(values: PayableValues): Promise<PayableRecord> {
    this.ids += 1;
    const record: PayableRecord = { ...values, id: `cp${String(this.ids)}` };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  cancel(id: string): Promise<PayableRecord> {
    const record: PayableRecord = {
      ...stored(this.rows, id),
      balance: Money.zero(),
      status: 'cancelled',
    };
    this.rows.set(id, record);
    return Promise.resolve(record);
  }

  /** What a treasury payment would leave behind. */
  pay(id: string, amount: number): void {
    const current = stored(this.rows, id);
    this.rows.set(id, {
      ...current,
      paidAmount: Money.of(amount),
      balance: current.amount.minus(amount),
      status: 'partial',
    });
  }
}

/** Every double wired into the four use cases, sharing state like one database would. */
export class ComprasWorld {
  readonly sequences = new MemorySequences();
  readonly uow = new MemoryUnitOfWork(this.sequences);
  readonly clock = new FixedClock();
  readonly audit = new MemoryAudit();
  readonly unseen = new MemoryUnseen();
  readonly stock = new MemoryStock();
  readonly catalog = new MemoryCatalog();
  readonly orderRows = new MemoryOrders();
  readonly receiptRows = new MemoryReceipts();
  readonly invoiceRows = new MemoryInvoices();
  readonly payableRows = new MemoryPayables();

  readonly orders = new PurchaseOrdersUseCases(
    this.uow,
    this.orderRows,
    this.catalog,
    this.sequences,
    this.clock,
    this.audit,
    this.unseen,
  );
  readonly receipts = new ReceiptsUseCases(
    this.uow,
    this.receiptRows,
    this.orderRows,
    this.catalog,
    this.stock,
    this.sequences,
    this.clock,
    this.audit,
    this.unseen,
  );
  readonly invoices = new SupplierInvoicesUseCases(
    this.uow,
    this.invoiceRows,
    this.payableRows,
    this.receiptRows,
    this.catalog,
    this.clock,
    this.audit,
    this.unseen,
  );
  readonly payables = new PayablesUseCases(this.payableRows, this.clock);

  /** An approved order of 10 Teclados at 50 and 5 Mouses at 20 into the central warehouse. */
  async approvedOrder(): Promise<string> {
    const order = await this.orders.create(
      {
        supplierId: 's1',
        warehouseId: 'w1',
        issuedAt: '2026-10-20',
        lines: [
          { productId: 'p1', quantity: 10, unitPrice: 50 },
          { productId: 'p2', quantity: 5, unitPrice: 20 },
        ],
      },
      BUYER,
    );
    await this.orders.runAction(order.id, 'approve', BUYER);
    return order.id;
  }
}
