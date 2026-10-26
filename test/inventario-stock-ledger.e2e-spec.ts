import { Money } from '../src/shared/domain/money/money';
import {
  STOCK_LEDGER,
  type StockLedger,
  type StockMovement,
} from '../src/shared/domain/ports/stock-ledger.port';
import { LedgerHarness } from './support/inventario/ledger-harness';

describe('StockLedger adapter (e2e)', () => {
  let harness: LedgerHarness;
  let ledger: StockLedger;

  const movement = (overrides: Partial<StockMovement>): StockMovement => ({
    productId: 'prod-1',
    warehouseId: 'wh-1',
    quantity: 1,
    origin: 'adjustment',
    reference: 'AJ-00001',
    date: '2026-10-25',
    ...overrides,
  });

  const move = (overrides: Partial<StockMovement>) =>
    harness.uow.run(() => ledger.move(movement(overrides)));

  const stockRow = () =>
    harness.prisma.stockItem.findUnique({
      where: { productId_warehouseId: { productId: 'prod-1', warehouseId: 'wh-1' } },
    });

  beforeAll(async () => {
    harness = await LedgerHarness.start();
    ledger = harness.get(STOCK_LEDGER) as StockLedger;
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.prisma.category.create({ data: { id: 'cat-1', code: 'C1', name: 'Equipos' } });
    await harness.prisma.product.create({
      data: {
        id: 'prod-1',
        sku: 'LAP-1',
        name: 'Laptop',
        categoryId: 'cat-1',
        unit: 'und',
        salePrice: 100,
        costPrice: 20,
        minStock: 3,
      },
    });
    await harness.prisma.warehouse.createMany({
      data: [
        { id: 'wh-1', code: 'W1', name: 'Central' },
        { id: 'wh-2', code: 'W2', name: 'Norte', status: 'inactive' },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates the row lazily and averages the cost of entries', async () => {
    const first = await move({ quantity: 10, unitCost: Money.of(20), origin: 'receipt' });
    const second = await move({ quantity: 5, unitCost: Money.of(26), origin: 'receipt' });

    expect(first.quantity).toBe(10);
    expect(second).toEqual({ quantity: 15, unitCost: Money.of(22) });
    const row = await stockRow();
    expect(row).toMatchObject({ quantity: 15, minStock: 3 });
    expect(row?.unitCost.toFixed(2)).toBe('22.00');
  });

  it('writes one kardex line per movement with the resulting balance and cost', async () => {
    await move({ quantity: 10, unitCost: Money.of(20), origin: 'receipt', reference: 'NI-1' });
    await move({ quantity: -4, origin: 'sale', reference: 'V-1' });

    const kardex = await harness.prisma.kardexEntry.findMany({ orderBy: { seq: 'asc' } });
    expect(
      kardex.map((entry) => ({
        reference: entry.reference,
        origin: entry.origin,
        quantity: entry.quantity,
        balance: entry.balance,
        unitCost: entry.unitCost.toFixed(2),
        productName: entry.productName,
        sku: entry.sku,
        warehouseName: entry.warehouseName,
        date: entry.date.toISOString().slice(0, 10),
      })),
    ).toEqual([
      {
        reference: 'NI-1',
        origin: 'receipt',
        quantity: 10,
        balance: 10,
        unitCost: '20.00',
        productName: 'Laptop',
        sku: 'LAP-1',
        warehouseName: 'Central',
        date: '2026-10-25',
      },
      {
        reference: 'V-1',
        origin: 'sale',
        quantity: -4,
        balance: 6,
        unitCost: '20.00',
        productName: 'Laptop',
        sku: 'LAP-1',
        warehouseName: 'Central',
        date: '2026-10-25',
      },
    ]);
  });

  it('rejects an exit larger than the stock and rolls back the whole unit of work', async () => {
    await move({ quantity: 2 });

    await expect(
      harness.uow.run(async () => {
        await ledger.move(movement({ quantity: 1 }));
        await ledger.move(movement({ quantity: -5 }));
      }),
    ).rejects.toThrow('Stock insuficiente de Laptop en Central: hay 3 und.');

    expect((await stockRow())?.quantity).toBe(2);
    expect(await harness.prisma.kardexEntry.count()).toBe(1);
  });

  it('serializes concurrent exits so the stock never goes negative', async () => {
    await move({ quantity: 10 });

    const results = await Promise.allSettled([
      move({ quantity: -6, reference: 'V-1' }),
      move({ quantity: -6, reference: 'V-2' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status !== 'rejected') {
      throw new Error('Expected one rejected move');
    }
    expect(String(rejected.reason)).toContain('hay 4 und.');
    expect((await stockRow())?.quantity).toBe(4);
  });

  it('fails when the product does not exist', async () => {
    await expect(move({ productId: 'missing' })).rejects.toThrow(
      'El producto o el almacén ya no existe.',
    );
  });

  it('initializes a product only in active warehouses', async () => {
    await harness.uow.run(() => ledger.initializeForProduct('prod-1'));
    await harness.uow.run(() => ledger.initializeForProduct('prod-1'));

    const rows = await harness.prisma.stockItem.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ warehouseId: 'wh-1', quantity: 0, minStock: 3 });
    expect(rows[0]?.unitCost.toFixed(2)).toBe('20.00');
  });

  it('initializes a warehouse with every product', async () => {
    await harness.prisma.product.create({
      data: {
        id: 'prod-2',
        sku: 'MOU-1',
        name: 'Mouse',
        categoryId: 'cat-1',
        unit: 'und',
        salePrice: 10,
        status: 'inactive',
      },
    });

    await harness.uow.run(() => ledger.initializeForWarehouse('wh-2'));

    const rows = await harness.prisma.stockItem.findMany({ where: { warehouseId: 'wh-2' } });
    expect(rows.map((row) => row.productId).sort()).toEqual(['prod-1', 'prod-2']);
  });
});
