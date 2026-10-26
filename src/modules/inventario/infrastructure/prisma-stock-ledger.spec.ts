import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { StockMovement } from '../../../shared/domain/ports/stock-ledger.port';
import type { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { PrismaStockLedger } from './prisma-stock-ledger';

const lockedRow = (quantity: number, unitCost: string) => ({
  id: 'stk-1',
  quantity,
  unit_cost: unitCost,
  product_name: 'Laptop',
  sku: 'LAP-1',
  unit: 'und',
  warehouse_name: 'Central',
});

interface KardexData {
  date: Date;
  unitCost: { toFixed(digits: number): string };
  quantity: number;
  balance: number;
}

interface StockUpdate {
  where: { id: string };
  data: { quantity: number; unitCost: unknown };
}

const ledgerWith = (rows: unknown[]) => {
  const client = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue(rows),
    stockItem: { update: jest.fn().mockResolvedValue({}) },
    kardexEntry: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const host = { client } as unknown as PrismaTransactionHost;
  return { client, ledger: new PrismaStockLedger(host) };
};

const movement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  productId: 'p1',
  warehouseId: 'w1',
  quantity: 5,
  origin: 'receipt',
  reference: 'NI-00001',
  date: '2026-10-25',
  ...overrides,
});

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

type SqlCall = [TemplateStringsArray, ...unknown[]];

function nth(fn: { mock: { calls: unknown[] } }, index = 0): unknown {
  const call = fn.mock.calls[index];
  if (call === undefined) {
    throw new Error(`Expected call #${String(index)}`);
  }
  return call;
}

describe('PrismaStockLedger', () => {
  it('creates the row lazily, locks it and averages the cost of an entry', async () => {
    const { client, ledger } = ledgerWith([lockedRow(10, '20.00')]);

    const result = await ledger.move(movement({ quantity: 5, unitCost: Money.of(26) }));

    expect(result.quantity).toBe(15);
    expect(result.unitCost.toFixed()).toBe('22.00');
    const insert = nth(client.$executeRaw) as SqlCall;
    expect(sqlOf(insert)).toContain('ON CONFLICT (product_id, warehouse_id) DO NOTHING');
    expect(insert.slice(1)).toEqual(['p1', 'w1']);
    expect(sqlOf(nth(client.$queryRaw) as SqlCall)).toContain('FOR UPDATE OF s');
    const [update] = nth(client.stockItem.update) as [StockUpdate];
    expect(update.where).toEqual({ id: 'stk-1' });
    expect(update.data.quantity).toBe(15);
    expect(update.data.unitCost).toBeDefined();
    const kardex = (nth(client.kardexEntry.create) as [{ data: KardexData }])[0].data;
    expect(kardex).toMatchObject({
      productId: 'p1',
      productName: 'Laptop',
      sku: 'LAP-1',
      warehouseId: 'w1',
      warehouseName: 'Central',
      origin: 'receipt',
      reference: 'NI-00001',
      quantity: 5,
      balance: 15,
    });
    expect(kardex.date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(kardex.unitCost.toFixed(2)).toBe('26.00');
  });

  it('rounds the weighted average half up to cents', async () => {
    const { ledger } = ledgerWith([lockedRow(2, '10.00')]);
    const result = await ledger.move(movement({ quantity: 1, unitCost: Money.of('10.01') }));
    expect(result.unitCost.toFixed()).toBe('10.00');

    const { ledger: other } = ledgerWith([lockedRow(1, '10.00')]);
    const rounded = await other.move(movement({ quantity: 1, unitCost: Money.of('10.01') }));
    expect(rounded.unitCost.toFixed()).toBe('10.01');
  });

  it('takes the entry cost when the row was empty', async () => {
    const { ledger } = ledgerWith([lockedRow(0, '99.00')]);
    const result = await ledger.move(movement({ quantity: 3, unitCost: Money.of('12.50') }));
    expect(result.unitCost.toFixed()).toBe('12.50');
  });

  it('keeps the average on exits and records it in the kardex', async () => {
    const { client, ledger } = ledgerWith([lockedRow(10, '20.00')]);

    const result = await ledger.move(
      movement({ quantity: -4, origin: 'sale', unitCost: Money.of(99) }),
    );

    expect(result).toEqual({ quantity: 6, unitCost: Money.of('20.00') });
    const kardex = (nth(client.kardexEntry.create) as [{ data: KardexData }])[0].data;
    expect(kardex.quantity).toBe(-4);
    expect(kardex.balance).toBe(6);
    expect(kardex.unitCost.toFixed(2)).toBe('20.00');
  });

  it('keeps the average on entries without a cost', async () => {
    const { ledger } = ledgerWith([lockedRow(10, '20.00')]);
    const result = await ledger.move(movement({ quantity: 2, origin: 'adjustment' }));
    expect(result.unitCost.toFixed()).toBe('20.00');
  });

  it('rejects an exit larger than the stock without writing', async () => {
    const { client, ledger } = ledgerWith([lockedRow(3, '20.00')]);

    const failure = ledger.move(movement({ quantity: -5 }));

    await expect(failure).rejects.toThrow(BusinessError);
    await expect(failure).rejects.toThrow('Stock insuficiente de Laptop en Central: hay 3 und.');
    expect(client.stockItem.update).not.toHaveBeenCalled();
    expect(client.kardexEntry.create).not.toHaveBeenCalled();
  });

  it('fails when the product or the warehouse does not exist', async () => {
    const { ledger } = ledgerWith([]);
    await expect(ledger.move(movement())).rejects.toThrow('El producto o el almacén ya no existe.');
  });

  it('initializes a product in every active warehouse', async () => {
    const { client, ledger } = ledgerWith([]);
    await ledger.initializeForProduct('p1');
    const call = nth(client.$executeRaw) as SqlCall;
    expect(sqlOf(call)).toContain("w.status = 'active'");
    expect(sqlOf(call)).toContain('ON CONFLICT (product_id, warehouse_id) DO NOTHING');
    expect(call.slice(1)).toEqual(['p1']);
  });

  it('initializes a warehouse with every product', async () => {
    const { client, ledger } = ledgerWith([]);
    await ledger.initializeForWarehouse('w1');
    const call = nth(client.$executeRaw) as SqlCall;
    expect(sqlOf(call)).not.toContain('status');
    expect(call.slice(1)).toEqual(['w1']);
  });
});
