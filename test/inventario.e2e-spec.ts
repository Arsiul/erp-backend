import { Money } from '../src/shared/domain/money/money';
import { STOCK_LEDGER, type StockLedger } from '../src/shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/shared/domain/ports/unit-of-work.port';
import { API, bodyOf, E2eContext } from './support/e2e-context';

interface ErrorBody {
  message: string;
}

interface StockBody {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  minStock: number;
  unitCost: number;
}

interface DocumentBody {
  id: string;
  number: string;
  status?: string;
  quantity: number;
}

interface KardexBody {
  origin: string;
  reference: string;
  quantity: number;
  balance: number;
  warehouseId: string;
}

describe('Inventario (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let compras: string;
  let ventas: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = admin) => ctx.http.get(`${API}${path}`).set(auth(token));
  const post = (path: string, body: object, token = admin) =>
    ctx.http.post(`${API}${path}`).set(auth(token)).send(body);
  const patch = (path: string, body: object, token = admin) =>
    ctx.http.patch(`${API}${path}`).set(auth(token)).send(body);

  const stockOf = async (warehouseId: string): Promise<StockBody | undefined> => {
    const rows = bodyOf<StockBody[]>(await get(`/stock?productId=prod-1`).expect(200));
    return rows.find((row) => row.warehouseId === warehouseId);
  };

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    compras = await ctx.tokenFor('role-compras');
    ventas = await ctx.tokenFor('role-ventas');
    await ctx.prisma.category.create({ data: { id: 'cat-1', code: 'C1', name: 'Equipos' } });
    await ctx.prisma.product.create({
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
    await ctx.prisma.warehouse.createMany({
      data: [
        { id: 'wh-1', code: 'W1', name: 'Central' },
        { id: 'wh-2', code: 'W2', name: 'Norte' },
        { id: 'wh-3', code: 'W3', name: 'Sur', status: 'inactive' },
      ],
    });
    const ledger = ctx.app.get<StockLedger>(STOCK_LEDGER);
    await ctx.app.get<UnitOfWork>(UNIT_OF_WORK).run(() =>
      ledger.move({
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: 10,
        origin: 'initial',
        reference: 'Saldo inicial',
        date: '2026-10-01',
        unitCost: Money.of('25.50'),
      }),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('enforces the inventario permissions', async () => {
    await ctx.http.get(`${API}/stock`).expect(401);
    await get('/stock', ventas).expect(200);
    await get('/kardex', ventas).expect(200);
    await post('/ajustes', {}, ventas).expect(403);
    await post('/transferencias', {}, ventas).expect(403);
    await patch('/stock/x', { minStock: 1 }, ventas).expect(403);
  });

  it('lists the stock, pages it and edits only the minimum', async () => {
    const paged = await get('/stock?page=1&pageSize=10&q=lap').expect(200);
    expect(paged.headers['x-total-count']).toBe('1');
    const row = await stockOf('wh-1');
    if (!row) {
      throw new Error('Missing stock row');
    }
    expect(row).toMatchObject({ quantity: 10, unitCost: 25.5 });

    const updated = await patch(`/stock/${row.id}`, { minStock: 7, quantity: 999 }, compras).expect(
      200,
    );
    expect(bodyOf<StockBody>(updated)).toMatchObject({ minStock: 7, quantity: 10 });
    const invalid = await patch(`/stock/${row.id}`, { minStock: -1 }).expect(422);
    expect(bodyOf<ErrorBody>(invalid).message).toBe('El stock mínimo debe ser un entero desde 0.');
    const huge = await patch(`/stock/${row.id}`, { minStock: 2_147_483_648 }).expect(422);
    expect(bodyOf<ErrorBody>(huge).message).toBe('El stock mínimo debe ser un entero desde 0.');
    const tooMany = await post('/ajustes', {
      productId: 'prod-1',
      warehouseId: 'wh-1',
      type: 'increase',
      quantity: 2_147_483_648,
      reason: 'count',
    }).expect(422);
    expect(bodyOf<ErrorBody>(tooMany).message).toBe(
      'La cantidad debe ser un entero mayor que cero.',
    );
    await get('/stock/nope').expect(404);
  });

  it('registers adjustments that move the stock and the kardex', async () => {
    const created = await post(
      '/ajustes',
      { productId: 'prod-1', warehouseId: 'wh-1', type: 'decrease', quantity: 2, reason: 'damage' },
      compras,
    ).expect(201);
    const adjustment = bodyOf<DocumentBody>(created);
    expect(adjustment).toMatchObject({ number: 'AJ-00001', quantity: 2 });
    expect((await stockOf('wh-1'))?.quantity).toBe(8);
    await get(`/ajustes/${adjustment.id}`).expect(200);
    expect(bodyOf<DocumentBody[]>(await get('/ajustes?type=decrease').expect(200))).toHaveLength(1);

    const kardex = bodyOf<KardexBody[]>(await get('/kardex?origin=adjustment').expect(200));
    expect(kardex).toEqual([
      expect.objectContaining({ reference: 'AJ-00001', quantity: -2, balance: 8 }),
    ]);

    const tooMany = await post('/ajustes', {
      productId: 'prod-1',
      warehouseId: 'wh-1',
      type: 'decrease',
      quantity: 50,
      reason: 'loss',
    }).expect(422);
    expect(bodyOf<ErrorBody>(tooMany).message).toBeTruthy();
    const noNotes = await post('/ajustes', {
      productId: 'prod-1',
      warehouseId: 'wh-1',
      type: 'increase',
      quantity: 1,
      reason: 'other',
    }).expect(422);
    expect(bodyOf<ErrorBody>(noNotes).message).toBe('Explica el motivo del ajuste en las notas.');
    expect((await stockOf('wh-1'))?.quantity).toBe(8);
  });

  it('runs a transfer from pending to completed at the origin cost', async () => {
    const created = await post(
      '/transferencias',
      {
        productId: 'prod-1',
        originWarehouseId: 'wh-1',
        destinationWarehouseId: 'wh-2',
        quantity: 3,
      },
      compras,
    ).expect(201);
    const transfer = bodyOf<DocumentBody>(created);
    expect(transfer).toMatchObject({ number: 'TR-00001', status: 'pending' });
    expect((await stockOf('wh-1'))?.quantity).toBe(8);

    const edited = await patch(`/transferencias/${transfer.id}`, { quantity: 4 }).expect(200);
    expect(bodyOf<DocumentBody>(edited).quantity).toBe(4);

    const completed = await post(`/transferencias/${transfer.id}/complete`, {}).expect(200);
    expect(bodyOf<DocumentBody>(completed).status).toBe('completed');
    expect((await stockOf('wh-1'))?.quantity).toBe(4);
    expect(await stockOf('wh-2')).toMatchObject({ quantity: 4, unitCost: 25.5 });

    const kardex = bodyOf<KardexBody[]>(await get('/kardex?origin=transfer').expect(200));
    expect(kardex.map((line) => `${line.warehouseId} ${String(line.quantity)}`).sort()).toEqual([
      'wh-1 -4',
      'wh-2 4',
    ]);

    const closed = await post(`/transferencias/${transfer.id}/complete`, {}).expect(422);
    expect(bodyOf<ErrorBody>(closed).message).toBe('La transferencia ya está cerrada.');
    const locked = await patch(`/transferencias/${transfer.id}`, { quantity: 1 }).expect(422);
    expect(bodyOf<ErrorBody>(locked).message).toBe('Solo se editan transferencias pendientes.');
  });

  it('validates transfers and cancels pending ones', async () => {
    const same = await post('/transferencias', {
      productId: 'prod-1',
      originWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-1',
      quantity: 1,
    }).expect(422);
    expect(bodyOf<ErrorBody>(same).message).toBe(
      'El origen y el destino deben ser almacenes distintos.',
    );
    const inactive = await post('/transferencias', {
      productId: 'prod-1',
      originWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-3',
      quantity: 1,
    }).expect(422);
    expect(bodyOf<ErrorBody>(inactive).message).toBe(
      'No puedes usar el almacén de destino porque está en estado inactivo.',
    );
    const short = await post('/transferencias', {
      productId: 'prod-1',
      originWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      quantity: 9,
    }).expect(422);
    expect(bodyOf<ErrorBody>(short).message).toBe('En Central solo hay 4 und de Laptop.');

    const created = await post('/transferencias', {
      productId: 'prod-1',
      originWarehouseId: 'wh-2',
      destinationWarehouseId: 'wh-1',
      quantity: 1,
    }).expect(201);
    const { id } = bodyOf<DocumentBody>(created);
    await post(`/transferencias/${id}/archive`, {}).expect(404);
    const cancelled = await post(`/transferencias/${id}/cancel`, {}).expect(200);
    expect(bodyOf<DocumentBody>(cancelled).status).toBe('cancelled');
    expect((await stockOf('wh-2'))?.quantity).toBe(4);

    const pending = await get('/transferencias?status=pending').expect(200);
    expect(bodyOf<DocumentBody[]>(pending)).toHaveLength(0);
    await get('/transferencias/nope').expect(404);
  });

  it('audits every write and marks new documents as unseen for others', async () => {
    const audit = await ctx.prisma.auditLog.findMany({ where: { module: 'inventario' } });
    expect(audit.map((entry) => `${entry.resource} ${entry.action}`)).toEqual(
      expect.arrayContaining([
        'stock Actualizó',
        'ajustes Registró',
        'transferencias Registró',
        'transferencias Actualizó',
        'transferencias Completó',
        'transferencias Anuló',
      ]),
    );
    expect(await ctx.prisma.unseenRecord.count({ where: { resource: 'ajustes' } })).toBeGreaterThan(
      0,
    );
  });
});
