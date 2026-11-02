import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, bodyOf, E2eContext } from './support/e2e-context';

const CSV = readFileSync(join(__dirname, '..', '..', 'datasets-import', 'ventas-completo.csv'), 'utf8');

describe('Importación de ventas con sus maestros (e2e, requires the db-test database)', () => {
  let ctx: E2eContext;
  let token: string;

  const importSales = () =>
    ctx.http
      .post(`${API}/transferencia/ventas/importar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: CSV })
      .expect(200);

  beforeAll(async () => {
    ctx = await E2eContext.start();
    token = (await ctx.signIn(ctx.admin)).token;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('crea en una sola importación las ventas, clientes, almacenes, categorías y productos', async () => {
    expect(bodyOf(await importSales())).toEqual({ ok: true, created: 22, updated: 0 });
    expect(await ctx.prisma.sale.count()).toBe(22);
    expect(await ctx.prisma.customer.count({ where: { documentNumber: '20604128731' } })).toBe(1);
    expect(await ctx.prisma.warehouse.count({ where: { name: { startsWith: 'Almacén Importación' } } })).toBe(2);
    expect(await ctx.prisma.product.count({ where: { sku: { startsWith: 'IMPV-' } } })).toBe(14);
  });

  it('vuelve a importar sin errores aunque los maestros estén inactivos o sin stock', async () => {
    await ctx.prisma.customer.updateMany({ data: { status: 'inactive' } });
    await ctx.prisma.warehouse.updateMany({ data: { status: 'inactive' } });
    await ctx.prisma.category.updateMany({ data: { status: 'inactive' } });
    await ctx.prisma.stockItem.updateMany({ data: { quantity: 0 } });

    expect(bodyOf(await importSales())).toEqual({ ok: true, created: 22, updated: 0 });
    expect(await ctx.prisma.sale.count()).toBe(44);
    expect(await ctx.prisma.customer.count({ where: { documentNumber: '20604128731' } })).toBe(1);
  });
});
