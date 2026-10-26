import type { ActingUser } from '../../../shared/application/listing/list-query';
import { UNKNOWN_ACTION } from '../../../shared/application/listing/resource-actions';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
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
  CommercialSettings,
  CreditNoteRecord,
  CreditNoteValues,
  CustomerRef,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceValues,
  ProductRef,
  QuoteRecord,
  QuoteStatus,
  QuoteValues,
  ReceivableBalance,
  ReceivableRecord,
  ReceivableValues,
  SaleEdit,
  SaleRecord,
  SaleStatus,
  SaleValues,
  WarehouseRef,
} from '../domain/commercial';
import type { CommercialLookups } from '../domain/ports/commercial-lookups.port';
import type {
  CreditNoteRepository,
  InvoiceRepository,
  QuoteRepository,
  ReceivableRepository,
  SaleRepository,
} from '../domain/ports/commercial-repositories.port';
import { CreditNotesUseCases } from './credit-notes.use-cases';
import { InvoicesUseCases } from './invoices.use-cases';
import { QuotesUseCases } from './quotes.use-cases';
import { ReceivablesUseCases } from './receivables.use-cases';
import { SalesUseCases } from './sales.use-cases';

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

class MemorySequences implements SequenceGenerator {
  private readonly counters = new Map<string, number>();

  next(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return Promise.resolve(value);
  }
}

const FIXED_CLOCK: Clock = { now: () => new Date('2026-10-25T15:00:00Z') };

/** Rows keyed by id with sequential ids; the base of every in-memory repository. */
class MemoryTable<T extends { readonly id: string }> {
  readonly rows = new Map<string, T>();
  readonly filters: unknown[] = [];
  private counter = 0;

  constructor(private readonly prefix: string) {}

  list(_criteria: ListCriteria, filter?: unknown): Promise<ListResult<T>> {
    this.filters.push(filter);
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  find(id: string): Promise<T | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(values: Omit<T, 'id'>): Promise<T> {
    this.counter += 1;
    const row = { ...values, id: `${this.prefix}${String(this.counter)}` } as T;
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }

  patch(id: string, values: Partial<T>): Promise<T> {
    const row = { ...this.rows.get(id), ...values } as T;
    this.rows.set(id, row);
    return Promise.resolve(row);
  }
}

class MemoryQuotes extends MemoryTable<QuoteRecord> implements QuoteRepository {
  constructor() {
    super('q');
  }

  update(id: string, values: QuoteValues): Promise<QuoteRecord> {
    return this.patch(id, values);
  }

  setStatus(id: string, status: QuoteStatus, saleNumber?: string): Promise<QuoteRecord> {
    return this.patch(id, saleNumber === undefined ? { status } : { status, saleNumber });
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

class MemorySales extends MemoryTable<SaleRecord> implements SaleRepository {
  constructor() {
    super('s');
  }

  override create(values: SaleValues): Promise<SaleRecord> {
    return super.create(values);
  }

  update(id: string, values: SaleEdit): Promise<SaleRecord> {
    return this.patch(id, values);
  }

  setStatus(id: string, status: SaleStatus): Promise<SaleRecord> {
    return this.patch(id, { status });
  }

  setInvoice(id: string, invoice: { id: string; number: string } | null): Promise<SaleRecord> {
    return this.patch(id, {
      invoiceId: invoice?.id ?? '',
      invoiceNumber: invoice?.number ?? '',
      status: invoice === null ? 'pending_invoice' : 'invoiced',
    });
  }
}

class MemoryInvoices extends MemoryTable<InvoiceRecord> implements InvoiceRepository {
  constructor() {
    super('i');
  }

  override create(values: InvoiceValues): Promise<InvoiceRecord> {
    return super.create(values);
  }

  setStatus(id: string, status: InvoiceStatus): Promise<InvoiceRecord> {
    return this.patch(id, { status });
  }

  setCreditedAmount(id: string, creditedAmount: number): Promise<InvoiceRecord> {
    return this.patch(id, { creditedAmount });
  }
}

class MemoryNotes extends MemoryTable<CreditNoteRecord> implements CreditNoteRepository {
  constructor() {
    super('n');
  }

  override create(values: CreditNoteValues): Promise<CreditNoteRecord> {
    return super.create(values);
  }
}

class MemoryReceivables extends MemoryTable<ReceivableRecord> implements ReceivableRepository {
  constructor() {
    super('r');
  }

  override create(values: ReceivableValues): Promise<ReceivableRecord> {
    return super.create(values);
  }

  findByInvoice(invoiceId: string): Promise<ReceivableRecord | null> {
    return Promise.resolve(
      [...this.rows.values()].find((row) => row.invoiceId === invoiceId) ?? null,
    );
  }

  setBalance(id: string, values: ReceivableBalance): Promise<ReceivableRecord> {
    return this.patch(id, values);
  }
}

const SETTINGS: CommercialSettings = {
  igvRate: '0.18',
  invoiceSeries: 'F001',
  receiptSeries: 'B001',
  creditNoteSeries: 'FC01',
  quoteValidityDays: 15,
};

const ANDES: CustomerRef = {
  id: 'c1',
  name: 'Andes SAC',
  documentType: 'RUC',
  documentNumber: '20123456789',
  creditDays: 30,
  creditLimit: 1000,
  status: 'active',
};
const ANA: CustomerRef = {
  id: 'c2',
  name: 'Ana Ruiz',
  documentType: 'DNI',
  documentNumber: '44556677',
  creditDays: 0,
  creditLimit: 0,
  status: 'active',
};
const CLOSED: CustomerRef = { ...ANA, id: 'c3', name: 'Cerrado', status: 'inactive' };
const CENTRAL: WarehouseRef = { id: 'w1', name: 'Central', status: 'active' };
const LAPTOP: ProductRef = { id: 'p1', name: 'Laptop', sku: 'LAP', salePrice: 100 };
const MOUSE: ProductRef = { id: 'p2', name: 'Mouse', sku: 'MOU', salePrice: 10 };

class MemoryLookups implements CommercialLookups {
  readonly customers = new Map([ANDES, ANA, CLOSED].map((c) => [c.id, c]));
  readonly warehouses = new Map<string, WarehouseRef>([[CENTRAL.id, CENTRAL]]);
  readonly catalog = new Map([LAPTOP, MOUSE].map((p) => [p.id, p]));
  readonly exposures: string[] = [];
  debt = 0;

  constructor(private readonly notes: MemoryNotes) {}

  customer(id: string): Promise<CustomerRef | null> {
    return Promise.resolve(this.customers.get(id) ?? null);
  }

  warehouse(id: string): Promise<WarehouseRef | null> {
    return Promise.resolve(this.warehouses.get(id) ?? null);
  }

  products(ids: readonly string[]): Promise<ReadonlyMap<string, ProductRef>> {
    const found = new Map<string, ProductRef>();
    for (const id of ids) {
      const product = this.catalog.get(id);
      if (product !== undefined) {
        found.set(id, product);
      }
    }
    return Promise.resolve(found);
  }

  settings(): Promise<CommercialSettings> {
    return Promise.resolve(SETTINGS);
  }

  exposure(customerId: string, exceptSaleId?: string): Promise<number> {
    this.exposures.push(`${customerId}|${exceptSaleId ?? ''}`);
    return Promise.resolve(this.debt);
  }

  creditedQuantities(invoiceId: string): Promise<ReadonlyMap<string, number>> {
    const credited = new Map<string, number>();
    for (const note of this.notes.rows.values()) {
      if (note.invoiceId === invoiceId) {
        for (const line of note.lines) {
          credited.set(line.productId, (credited.get(line.productId) ?? 0) + line.quantity);
        }
      }
    }
    return Promise.resolve(credited);
  }
}

class MemoryLedger implements StockLedger {
  readonly movements: StockMovement[] = [];
  readonly stock = new Map<string, number>([
    ['p1|w1', 10],
    ['p2|w1', 50],
  ]);

  move(movement: StockMovement): Promise<StockBalance> {
    const key = `${movement.productId}|${movement.warehouseId}`;
    const quantity = (this.stock.get(key) ?? 0) + movement.quantity;
    if (quantity < 0) {
      return Promise.reject(new BusinessError('Stock insuficiente.'));
    }
    this.stock.set(key, quantity);
    this.movements.push(movement);
    return Promise.resolve({ quantity, unitCost: Money.zero() });
  }

  initializeForProduct(): Promise<void> {
    return Promise.resolve();
  }

  initializeForWarehouse(): Promise<void> {
    return Promise.resolve();
  }

  summary(): string[] {
    return this.movements.map(
      (m) => `${m.origin} ${m.productId} ${String(m.quantity)} ${m.reference}`,
    );
  }
}

function setup() {
  const uow = new ImmediateUnitOfWork();
  const audit = new MemoryAudit();
  const unseen = new MemoryUnseen();
  const sequences = new MemorySequences();
  const quotes = new MemoryQuotes();
  const sales = new MemorySales();
  const invoices = new MemoryInvoices();
  const notes = new MemoryNotes();
  const receivables = new MemoryReceivables();
  const lookups = new MemoryLookups(notes);
  const ledger = new MemoryLedger();
  return {
    audit,
    unseen,
    quotes,
    sales,
    invoices,
    notes,
    receivables,
    lookups,
    ledger,
    quoteCases: new QuotesUseCases(uow, quotes, lookups, sequences, FIXED_CLOCK, audit, unseen),
    saleCases: new SalesUseCases(
      uow,
      sales,
      quotes,
      lookups,
      ledger,
      sequences,
      FIXED_CLOCK,
      audit,
      unseen,
    ),
    invoiceCases: new InvoicesUseCases(
      uow,
      invoices,
      sales,
      receivables,
      lookups,
      sequences,
      FIXED_CLOCK,
      audit,
      unseen,
    ),
    noteCases: new CreditNotesUseCases(
      uow,
      notes,
      invoices,
      receivables,
      lookups,
      ledger,
      sequences,
      FIXED_CLOCK,
      audit,
      unseen,
    ),
    receivableCases: new ReceivablesUseCases(receivables, FIXED_CLOCK),
  };
}

type World = ReturnType<typeof setup>;

const LINES = [
  { productId: 'p1', quantity: 2 },
  { productId: 'p2', quantity: 5 },
];

const newQuote = (world: World, patch: Record<string, unknown> = {}) =>
  world.quoteCases.create({ customerId: 'c1', seller: 'Rosa', lines: LINES, ...patch }, ADMIN);

const newSale = (world: World, patch: Record<string, unknown> = {}) =>
  world.saleCases.create(
    { customerId: 'c1', warehouseId: 'w1', seller: 'Rosa', lines: LINES, ...patch },
    ADMIN,
  );

async function invoicedSale(world: World, patch: Record<string, unknown> = {}) {
  const sale = await newSale(world, { paymentTerm: 'credit', ...patch });
  const invoice = await world.invoiceCases.create({ saleId: sale.id }, ADMIN);
  return { sale, invoice };
}

function firstReceivable(world: World): ReceivableRecord {
  const [receivable] = world.receivables.rows.values();
  if (receivable === undefined) {
    throw new Error('no receivable');
  }
  return receivable;
}

async function expectNotFound(promise: Promise<unknown>, message?: string): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(NotFoundError);
  if (message !== undefined) {
    expect((error as Error).message).toBe(message);
  }
}

describe('QuotesUseCases', () => {
  it('creates a draft quote with defaults from the settings', async () => {
    const world = setup();
    const quote = await newQuote(world, { notes: ' urgente ' });

    expect(quote).toMatchObject({
      number: 'COT-00001',
      customerName: 'Andes SAC',
      issuedAt: TODAY,
      validUntil: '2026-11-09',
      status: 'draft',
      subtotal: 250,
      igv: 45,
      total: 295,
      notes: 'urgente',
    });
    expect(world.unseen.created).toEqual([`cotizaciones/${quote.id} by admin`]);
    expect(world.audit.actions()).toEqual(['cotizaciones Registró COT-00001']);
  });

  it('rejects inactive customers and empty sellers', async () => {
    const world = setup();
    await expect(newQuote(world, { customerId: 'c3' })).rejects.toThrow(
      'No puedes usar el cliente porque está en estado inactivo.',
    );
    await expect(newQuote(world, { customerId: undefined })).rejects.toThrow(
      'Selecciona el cliente.',
    );
    await expect(newQuote(world, { seller: '' })).rejects.toThrow('Elige el vendedor.');
  });

  it('lists with the status filter and reads one quote', async () => {
    const world = setup();
    const quote = await newQuote(world);

    const result = await world.quoteCases.list({ status: 'overdue', page: 1 });
    expect(result).toMatchObject({ total: 1, paged: true });
    expect(world.quotes.filters).toEqual([{ status: 'overdue', today: TODAY }]);
    expect((await world.quoteCases.list({})).paged).toBe(false);
    await expect(world.quoteCases.get(quote.id)).resolves.toEqual(quote);
    await expectNotFound(world.quoteCases.get('missing'));
  });

  it('updates the customer, the lines and the totals', async () => {
    const world = setup();
    const quote = await newQuote(world);

    const updated = await world.quoteCases.update(
      quote.id,
      { customerId: 'c2', lines: [{ productId: 'p2', quantity: 1, unitPrice: 8 }] },
      ADMIN,
    );
    expect(updated).toMatchObject({ customerName: 'Ana Ruiz', subtotal: 8, total: 9.44 });

    const kept = await world.quoteCases.update(quote.id, { seller: 'Luis' }, ADMIN);
    expect(kept).toMatchObject({ seller: 'Luis', customerId: 'c2', subtotal: 8 });
    expect(world.audit.actions()).toContain('cotizaciones Actualizó COT-00001');
  });

  it('refuses invalid edits', async () => {
    const world = setup();
    const quote = await newQuote(world);

    await expect(
      world.quoteCases.update(quote.id, { validUntil: '2026-10-01' }, ADMIN),
    ).rejects.toThrow('La validez no puede ser anterior a la emisión.');
    await expectNotFound(world.quoteCases.update('missing', {}, ADMIN));
    await world.quoteCases.runAction(quote.id, 'reject', ADMIN);
    await expect(world.quoteCases.update(quote.id, {}, ADMIN)).rejects.toThrow(
      'Solo se editan cotizaciones en borrador o enviadas.',
    );
  });

  it('removes only drafts', async () => {
    const world = setup();
    const draft = await newQuote(world);
    const sent = await newQuote(world);
    await world.quoteCases.runAction(sent.id, 'send', ADMIN);

    await world.quoteCases.remove(draft.id, ADMIN);
    expect(world.quotes.rows.has(draft.id)).toBe(false);
    expect(world.unseen.forgotten).toEqual([`cotizaciones/${draft.id}`]);
    expect(world.audit.actions()).toContain('cotizaciones Eliminó COT-00001');
    await expect(world.quoteCases.remove(sent.id, ADMIN)).rejects.toThrow(
      'Solo se eliminan cotizaciones en borrador; rechaza las demás.',
    );
  });

  it('runs send, accept and reject', async () => {
    const world = setup();
    const quote = await newQuote(world);

    expect((await world.quoteCases.runAction(quote.id, 'send', ADMIN)).status).toBe('sent');
    expect((await world.quoteCases.runAction(quote.id, 'accept', ADMIN)).status).toBe('accepted');
    expect((await world.quoteCases.runAction(quote.id, 'reject', ADMIN)).status).toBe('rejected');
    expect(world.audit.actions().slice(-3)).toEqual([
      'cotizaciones Envió COT-00001',
      'cotizaciones Aceptó COT-00001',
      'cotizaciones Rechazó COT-00001',
    ]);
    await expectNotFound(world.quoteCases.runAction(quote.id, 'fly', ADMIN), UNKNOWN_ACTION);
    await expectNotFound(world.quoteCases.runAction('missing', 'fly', ADMIN));
  });
});

describe('SalesUseCases', () => {
  it('converts an accepted quote and ships its stock', async () => {
    const world = setup();
    const quote = await newQuote(world);
    await world.quoteCases.runAction(quote.id, 'accept', ADMIN);

    const sale = await world.saleCases.create({ quoteId: quote.id, warehouseId: 'w1' }, ADMIN);
    expect(sale).toMatchObject({
      number: 'VTA-00001',
      customerId: 'c1',
      quoteNumber: 'COT-00001',
      seller: 'Rosa',
      paymentTerm: 'cash',
      status: 'pending_invoice',
      total: 295,
    });
    expect(world.ledger.summary()).toEqual(['sale p1 -2 VTA-00001', 'sale p2 -5 VTA-00001']);
    expect(world.quotes.rows.get(quote.id)).toMatchObject({
      status: 'converted',
      saleNumber: 'VTA-00001',
    });
    expect(world.audit.actions()).toContain('ventas Registró VTA-00001');
  });

  it('refuses quotes that are not accepted or belong to another customer', async () => {
    const world = setup();
    const quote = await newQuote(world);

    await expect(
      world.saleCases.create({ quoteId: quote.id, warehouseId: 'w1' }, ADMIN),
    ).rejects.toThrow('La cotización COT-00001 no está aceptada.');
    await world.quoteCases.runAction(quote.id, 'accept', ADMIN);
    await expect(newSale(world, { quoteId: quote.id, customerId: 'c2' })).rejects.toThrow(
      'La venta debe ser para el cliente de la cotización.',
    );
    await expect(newSale(world, { quoteId: 'missing' })).rejects.toThrow(
      'Selecciona la cotización.',
    );
  });

  it('checks credit before numbering or moving stock', async () => {
    const world = setup();
    world.lookups.debt = 900;

    await expect(newSale(world, { paymentTerm: 'credit' })).rejects.toThrow(
      'La venta supera el crédito disponible de Andes SAC (S/ 100.00).',
    );
    await expect(newSale(world, { customerId: 'c2', paymentTerm: 'credit' })).rejects.toThrow(
      'Ana Ruiz no tiene crédito aprobado; véndele al contado.',
    );
    await expect(newSale(world, { paymentTerm: 'later' })).rejects.toThrow(
      'Elige la condición de pago.',
    );
    await expect(newSale(world, { warehouseId: '' })).rejects.toThrow(
      'Selecciona el almacén de despacho.',
    );
    expect(world.ledger.movements).toEqual([]);

    world.lookups.debt = 0;
    const sale = await newSale(world, { paymentTerm: 'credit', issuedAt: '2026-10-24' });
    expect(sale).toMatchObject({
      number: 'VTA-00001',
      paymentTerm: 'credit',
      issuedAt: '2026-10-24',
    });
    expect(world.lookups.exposures).toContain('c1|');
  });

  it('propagates insufficient stock', async () => {
    const world = setup();
    await expect(newSale(world, { lines: [{ productId: 'p1', quantity: 11 }] })).rejects.toThrow(
      'Stock insuficiente.',
    );
  });

  it('lists and reads sales', async () => {
    const world = setup();
    const sale = await newSale(world);
    expect(await world.saleCases.list({ status: 'invoiced' })).toMatchObject({ total: 1 });
    expect(world.sales.filters).toEqual([{ status: 'invoiced', today: TODAY }]);
    await expect(world.saleCases.get(sale.id)).resolves.toEqual(sale);
    await expectNotFound(world.saleCases.get('missing'));
  });

  it('edits the seller, the payment term and the notes of a pending sale', async () => {
    const world = setup();
    const sale = await newSale(world);

    const updated = await world.saleCases.update(
      sale.id,
      { seller: 'Luis', paymentTerm: 'credit', notes: 'a 30 días' },
      ADMIN,
    );
    expect(updated).toMatchObject({ seller: 'Luis', paymentTerm: 'credit', notes: 'a 30 días' });
    expect(world.lookups.exposures).toEqual([`c1|${sale.id}`]);
    expect(world.audit.actions()).toContain('ventas Actualizó VTA-00001');

    const kept = await world.saleCases.update(sale.id, {}, ADMIN);
    expect(kept).toMatchObject({ seller: 'Luis', paymentTerm: 'credit' });
  });

  it('refuses credit changes without room and edits of closed sales', async () => {
    const world = setup();
    const sale = await newSale(world, { customerId: 'c2' });

    await expect(world.saleCases.update(sale.id, { paymentTerm: 'credit' }, ADMIN)).rejects.toThrow(
      'Ana Ruiz no tiene crédito suficiente para esta venta.',
    );
    await world.saleCases.runAction(sale.id, 'cancel', ADMIN);
    await expect(world.saleCases.update(sale.id, {}, ADMIN)).rejects.toThrow(
      'Solo se editan ventas pendientes de facturar.',
    );
    await expectNotFound(world.saleCases.update('missing', {}, ADMIN));
  });

  it('cancels a sale, restocks it and reopens its quote', async () => {
    const world = setup();
    const quote = await newQuote(world);
    await world.quoteCases.runAction(quote.id, 'accept', ADMIN);
    const sale = await world.saleCases.create({ quoteId: quote.id, warehouseId: 'w1' }, ADMIN);

    const cancelled = await world.saleCases.runAction(sale.id, 'cancel', ADMIN);
    expect(cancelled.status).toBe('cancelled');
    expect(world.ledger.summary().slice(-2)).toEqual([
      'sale_cancel p1 2 VTA-00001',
      'sale_cancel p2 5 VTA-00001',
    ]);
    expect(world.ledger.stock.get('p1|w1')).toBe(10);
    expect(world.quotes.rows.get(quote.id)).toMatchObject({ status: 'accepted', saleNumber: '' });
    expect(world.audit.actions()).toContain('ventas Anuló VTA-00001');
    await expect(world.saleCases.runAction(sale.id, 'cancel', ADMIN)).rejects.toThrow(
      'Solo se anulan ventas sin facturar; para una facturada, anula el comprobante primero.',
    );
  });

  it('cancels a sale whose quote no longer exists', async () => {
    const world = setup();
    const sale = await newSale(world);
    world.sales.rows.set(sale.id, { ...sale, quoteId: 'gone' });

    await expect(world.saleCases.runAction(sale.id, 'cancel', ADMIN)).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expectNotFound(world.saleCases.runAction(sale.id, 'fly', ADMIN), UNKNOWN_ACTION);
    await expectNotFound(world.saleCases.runAction('missing', 'cancel', ADMIN));
  });
});

describe('InvoicesUseCases', () => {
  it('bills a credit sale with a factura and opens its receivable', async () => {
    const world = setup();
    const { sale, invoice } = await invoicedSale(world);

    expect(invoice).toMatchObject({
      kind: 'factura',
      number: 'F001-00000001',
      saleNumber: 'VTA-00001',
      customerDocument: 'RUC 20123456789',
      issuedAt: TODAY,
      dueAt: '2026-11-24',
      total: 295,
      creditedAmount: 0,
      status: 'issued',
    });
    expect([...world.receivables.rows.values()]).toEqual([
      expect.objectContaining({
        invoiceId: invoice.id,
        documentNumber: 'F001-00000001',
        amount: 295,
        balance: 295,
        dueAt: '2026-11-24',
        status: 'pending',
      }),
    ]);
    expect(world.sales.rows.get(sale.id)).toMatchObject({
      status: 'invoiced',
      invoiceNumber: 'F001-00000001',
    });
    expect(world.unseen.created).toContain(`comprobantes/${invoice.id} by admin`);
    expect(world.audit.actions()).toContain('comprobantes Registró F001-00000001');
  });

  it('bills a cash sale of a DNI customer with a boleta due the same day', async () => {
    const world = setup();
    const sale = await newSale(world, { customerId: 'c2' });

    const invoice = await world.invoiceCases.create(
      { saleId: sale.id, issuedAt: '2026-10-26' },
      ADMIN,
    );
    expect(invoice).toMatchObject({ kind: 'boleta', number: 'B001-00000001', dueAt: '2026-10-26' });
    await expect(world.invoiceCases.create({ saleId: sale.id }, ADMIN)).rejects.toThrow(
      'La venta VTA-00001 ya fue facturada o está anulada.',
    );
  });

  it('refuses missing sales, a factura without RUC and dates before the sale', async () => {
    const world = setup();
    const sale = await newSale(world, { customerId: 'c2', issuedAt: '2026-10-20' });

    await expect(world.invoiceCases.create({}, ADMIN)).rejects.toThrow(
      'Selecciona la venta a facturar.',
    );
    await expect(
      world.invoiceCases.create({ saleId: sale.id, kind: 'factura' }, ADMIN),
    ).rejects.toThrow('La factura exige un cliente con RUC; emite una boleta.');
    await expect(
      world.invoiceCases.create({ saleId: sale.id, issuedAt: '2026-10-19' }, ADMIN),
    ).rejects.toThrow('El comprobante no puede ser anterior a la venta.');
    world.lookups.customers.delete('c2');
    await expect(world.invoiceCases.create({ saleId: sale.id }, ADMIN)).rejects.toThrow(
      'Selecciona el cliente.',
    );
  });

  it('lists and reads invoices', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    expect(await world.invoiceCases.list({ status: 'issued', page: 2 })).toMatchObject({
      total: 1,
      paged: true,
    });
    expect(world.invoices.filters).toEqual([{ status: 'issued', today: TODAY }]);
    await expect(world.invoiceCases.get(invoice.id)).resolves.toEqual(invoice);
    await expectNotFound(world.invoiceCases.get('missing'));
  });

  it('cancels an untouched invoice, closes the receivable and reopens the sale', async () => {
    const world = setup();
    const { sale, invoice } = await invoicedSale(world);

    const cancelled = await world.invoiceCases.runAction(invoice.id, 'cancel', ADMIN);
    expect(cancelled.status).toBe('cancelled');
    expect(firstReceivable(world)).toMatchObject({
      balance: 0,
      status: 'cancelled',
    });
    expect(world.sales.rows.get(sale.id)).toMatchObject({
      status: 'pending_invoice',
      invoiceId: '',
    });
    expect(world.audit.actions()).toContain('comprobantes Anuló F001-00000001');
    await expect(world.invoiceCases.runAction(invoice.id, 'cancel', ADMIN)).rejects.toThrow(
      'El comprobante ya está anulado.',
    );

    const again = await world.invoiceCases.create({ saleId: sale.id }, ADMIN);
    expect(again.number).toBe('F001-00000002');
  });

  it('refuses cancelling invoices with collections, notes or no receivable', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    const receivable = firstReceivable(world);

    world.receivables.rows.set(receivable.id, { ...receivable, paidAmount: 10 });
    await expect(world.invoiceCases.runAction(invoice.id, 'cancel', ADMIN)).rejects.toThrow(
      'El comprobante tiene cobros; anúlalos en Tesorería antes.',
    );
    world.receivables.rows.delete(receivable.id);
    await expect(world.invoiceCases.runAction(invoice.id, 'cancel', ADMIN)).rejects.toThrow(
      'El comprobante F001-00000001 no tiene cuenta por cobrar.',
    );
    await expectNotFound(world.invoiceCases.runAction(invoice.id, 'fly', ADMIN), UNKNOWN_ACTION);
    await expectNotFound(world.invoiceCases.runAction('missing', 'cancel', ADMIN));
  });

  it('cancels an invoice whose sale no longer exists', async () => {
    const world = setup();
    const { sale, invoice } = await invoicedSale(world);
    world.sales.rows.delete(sale.id);

    await expect(world.invoiceCases.runAction(invoice.id, 'cancel', ADMIN)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });
});

describe('CreditNotesUseCases', () => {
  it('returns goods: restocks, lowers the receivable and credits the invoice', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);

    const note = await world.noteCases.create(
      {
        invoiceId: invoice.id,
        reason: 'return',
        lines: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 0 },
        ],
        notes: 'equipo fallado',
      },
      ADMIN,
    );
    expect(note).toMatchObject({
      number: 'FC01-00000001',
      invoiceNumber: 'F001-00000001',
      warehouseName: 'Central',
      reason: 'return',
      issuedAt: TODAY,
      subtotal: 100,
      igv: 18,
      total: 118,
    });
    expect(world.ledger.summary().slice(-1)).toEqual(['credit_note p1 1 FC01-00000001']);
    expect(firstReceivable(world)).toMatchObject({
      creditedAmount: 118,
      balance: 177,
      status: 'partial',
    });
    expect(world.invoices.rows.get(invoice.id)?.creditedAmount).toBe(118);
    expect(world.unseen.created).toContain(`notas-credito/${note.id} by admin`);
    expect(world.audit.actions()).toContain('notas-credito Registró FC01-00000001');
  });

  it('discounts a boleta without moving stock and can settle the balance', async () => {
    const world = setup();
    const sale = await newSale(world, { customerId: 'c2' });
    const invoice = await world.invoiceCases.create({ saleId: sale.id }, ADMIN);
    const moves = world.ledger.movements.length;

    const note = await world.noteCases.create(
      {
        invoiceId: invoice.id,
        reason: 'discount',
        lines: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 5 },
        ],
      },
      ADMIN,
    );
    expect(note).toMatchObject({ number: 'BC01-00000001', total: 295 });
    expect(world.ledger.movements).toHaveLength(moves);
    expect(firstReceivable(world)).toMatchObject({ balance: 0, status: 'paid' });
  });

  it('refuses lines beyond the invoiced units, prices or balance', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    const create = (lines: unknown, reason = 'discount') =>
      world.noteCases.create({ invoiceId: invoice.id, reason, lines }, ADMIN);

    await create([{ productId: 'p1', quantity: 2 }]);
    await expect(create([{ productId: 'p1', quantity: 1 }])).rejects.toThrow(
      'De Laptop solo quedan 0 unidades por acreditar.',
    );
    await expect(create([{ productId: 'p2', quantity: 1, unitPrice: 11 }])).rejects.toThrow(
      'El precio de Mouse supera el facturado.',
    );
    await expect(create([{ productId: 'p2', quantity: 0 }])).rejects.toThrow(
      'Agrega al menos un producto.',
    );
    await expect(create([{ productId: 'p1', quantity: 1 }], 'gift')).rejects.toThrow(
      'Elige el motivo.',
    );
    const receivable = firstReceivable(world);
    world.receivables.rows.set(receivable.id, { ...receivable, balance: 10 });
    await expect(create([{ productId: 'p2', quantity: 5 }])).rejects.toThrow(
      'La nota (S/ 59.00) supera el saldo por cobrar (S/ 10.00).',
    );
  });

  it('refuses missing or cancelled invoices and returns without a warehouse', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    const lines = [{ productId: 'p1', quantity: 1 }];

    await expect(world.noteCases.create({ reason: 'return', lines }, ADMIN)).rejects.toThrow(
      'Selecciona el comprobante.',
    );
    world.lookups.warehouses.clear();
    await expect(
      world.noteCases.create({ invoiceId: invoice.id, reason: 'return', lines }, ADMIN),
    ).rejects.toThrow('El almacén del comprobante ya no existe.');
    world.invoices.rows.set(invoice.id, { ...invoice, status: 'cancelled' });
    await expect(
      world.noteCases.create({ invoiceId: invoice.id, reason: 'error', lines }, ADMIN),
    ).rejects.toThrow('El comprobante F001-00000001 está anulado.');
  });

  it('issues a non-return note when the invoice warehouse no longer exists', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    world.lookups.warehouses.clear();

    const note = await world.noteCases.create(
      { invoiceId: invoice.id, reason: 'discount', lines: [{ productId: 'p2', quantity: 1 }] },
      ADMIN,
    );
    expect(note).toMatchObject({ warehouseId: invoice.warehouseId, warehouseName: '' });
  });

  it('lists, reads and rejects actions on credit notes', async () => {
    const world = setup();
    const { invoice } = await invoicedSale(world);
    const note = await world.noteCases.create(
      { invoiceId: invoice.id, reason: 'error', lines: [{ productId: 'p2', quantity: 1 }] },
      ADMIN,
    );

    expect(await world.noteCases.list({ q: 'FC01' })).toMatchObject({ total: 1, paged: false });
    await expect(world.noteCases.get(note.id)).resolves.toEqual(note);
    await expectNotFound(world.noteCases.runAction(note.id, 'cancel'), UNKNOWN_ACTION);
    await expectNotFound(world.noteCases.runAction('missing', 'cancel'));
  });
});

describe('ReceivablesUseCases', () => {
  it('lists, reads and rejects actions on receivables', async () => {
    const world = setup();
    await invoicedSale(world);
    const receivable = firstReceivable(world);

    expect(await world.receivableCases.list({ status: 'overdue', page: 1 })).toMatchObject({
      total: 1,
      paged: true,
    });
    await world.receivableCases.list({ customerId: ' cus-1 ' });
    expect(world.receivables.filters).toEqual([
      { status: 'overdue', customerId: undefined, today: TODAY },
      { status: undefined, customerId: 'cus-1', today: TODAY },
    ]);
    await expect(world.receivableCases.get(receivable.id)).resolves.toEqual(receivable);
    await expectNotFound(world.receivableCases.get('missing'));
    await expectNotFound(world.receivableCases.runAction(receivable.id, 'pay'), UNKNOWN_ACTION);
  });
});
