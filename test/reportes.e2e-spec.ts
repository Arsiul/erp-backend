import { todayOf } from '../src/shared/application/clock/today';
import { CLOCK, type Clock } from '../src/shared/domain/ports/clock.port';
import { API, bodyOf, E2eContext } from './support/e2e-context';

interface KpiBody {
  id: string;
  value: number;
}

interface SummaryBody {
  primaryKpis: KpiBody[];
  operationalKpis: KpiBody[];
  monthlyTotals: { month: string; sales: number; purchases: number }[];
  recentSales: { number: string; total: number }[];
  topProducts: { id: string }[];
}

interface AlertBody {
  id: string;
  path: string;
}

interface ReportBody {
  title: string;
  rows: Record<string, unknown>[];
  kpis: KpiBody[];
  chart: { label: string; value: number }[];
}

interface FiltersBody {
  dates: boolean;
  party?: { label: string; options: { value: string; label: string }[] };
}

interface ErrorBody {
  statusCode: number;
  code: string;
}

jest.setTimeout(120_000);

const DAY_MS = 86_400_000;

/** Shifts an ISO day by whole days. */
function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

describe('Reportes (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let today: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = admin) => ctx.http.get(`${API}${path}`).set(auth(token));
  const summaryOf = async (token = admin) =>
    bodyOf<SummaryBody>(await get('/dashboard/summary', token).expect(200));
  const kpiIds = (summary: SummaryBody) =>
    [...summary.primaryKpis, ...summary.operationalKpis].map((kpi) => kpi.id);
  const kpiOf = (summary: SummaryBody, id: string) =>
    [...summary.primaryKpis, ...summary.operationalKpis].find((kpi) => kpi.id === id)?.value;
  const reportOf = async (path: string, token = admin) =>
    bodyOf<ReportBody>(await get(`/reports/${path}`, token).expect(200));
  const kpiValues = (report: ReportBody) => report.kpis.map((kpi) => kpi.value);

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    today = todayOf(ctx.app.get<Clock>(CLOCK));
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('on an empty database', () => {
    it('returns zeros and empty lists', async () => {
      const summary = await summaryOf();
      expect(
        [...summary.primaryKpis, ...summary.operationalKpis].every((kpi) => kpi.value === 0),
      ).toBe(true);
      expect(summary.monthlyTotals).toHaveLength(6);
      expect(
        summary.monthlyTotals.every((month) => month.sales === 0 && month.purchases === 0),
      ).toBe(true);
      expect(summary.recentSales).toEqual([]);
      expect(summary.topProducts).toEqual([]);
      expect(bodyOf<AlertBody[]>(await get('/alerts').expect(200))).toEqual([]);

      for (const report of ['ventas', 'compras', 'inventario', 'saldos']) {
        const body = await reportOf(report);
        expect(body.rows).toEqual([]);
        expect(body.kpis.every((kpi) => kpi.value === 0)).toBe(true);
        expect(body.chart.every((point) => point.value === 0)).toBe(true);
      }
      const filters = bodyOf<FiltersBody>(await get('/reports/ventas/filters').expect(200));
      expect(filters).toEqual({ dates: true, party: { label: 'Cliente', options: [] } });
    });
  });

  describe('with operations', () => {
    beforeAll(async () => {
      const db = ctx.prisma;
      await db.category.create({ data: { id: 'cat-1', code: 'C1', name: 'Equipos' } });
      await db.product.create({
        data: {
          id: 'prod-1',
          sku: 'LAP-1',
          name: 'Laptop',
          categoryId: 'cat-1',
          unit: 'und',
          salePrice: 100,
          costPrice: 10,
          minStock: 5,
        },
      });
      await db.warehouse.createMany({
        data: [
          { id: 'wh-1', code: 'W1', name: 'Central' },
          { id: 'wh-2', code: 'W2', name: 'Norte' },
        ],
      });
      await db.stockItem.createMany({
        data: [
          { productId: 'prod-1', warehouseId: 'wh-1', quantity: 2, minStock: 5, unitCost: 10 },
          { productId: 'prod-1', warehouseId: 'wh-2', quantity: 10, minStock: 0, unitCost: 10 },
        ],
      });
      await db.customer.create({
        data: {
          id: 'cus-1',
          code: 'CL1',
          name: 'Andes SAC',
          documentType: 'RUC',
          documentNumber: '20111111111',
        },
      });
      await db.supplier.create({
        data: { id: 'sup-1', code: 'PR1', name: 'Proveedor Uno', ruc: '20222222222' },
      });

      const sale = {
        customerId: 'cus-1',
        customerName: 'Andes SAC',
        warehouseId: 'wh-1',
        warehouseName: 'Central',
        issuedAt: dateOf(today),
        seller: 'Ana Ventas',
      };
      await db.sale.createMany({
        data: [
          {
            ...sale,
            id: 'sale-1',
            number: 'V-00001',
            subtotal: 100,
            igv: 18,
            total: 118,
            status: 'invoiced',
          },
          {
            ...sale,
            id: 'sale-2',
            number: 'V-00002',
            subtotal: 500,
            igv: 90,
            total: 590,
            status: 'cancelled',
          },
          { ...sale, id: 'sale-3', number: 'V-00003', subtotal: 50, igv: 9, total: 59 },
        ],
      });
      await db.invoice.create({
        data: {
          id: 'inv-1',
          kind: 'factura',
          number: 'F001-00000001',
          saleId: 'sale-1',
          saleNumber: 'V-00001',
          customerId: 'cus-1',
          customerName: 'Andes SAC',
          customerDocument: '20111111111',
          warehouseId: 'wh-1',
          issuedAt: dateOf(shift(today, -40)),
          dueAt: dateOf(shift(today, -10)),
          subtotal: 100,
          igv: 18,
          total: 118,
        },
      });
      await db.receivable.create({
        data: {
          invoiceId: 'inv-1',
          documentNumber: 'F001-00000001',
          customerId: 'cus-1',
          customerName: 'Andes SAC',
          issuedAt: dateOf(shift(today, -40)),
          dueAt: dateOf(shift(today, -10)),
          amount: 118,
          balance: 118,
        },
      });
      await db.supplierInvoice.create({
        data: {
          id: 'sinv-1',
          documentNumber: 'FP-0001',
          supplierId: 'sup-1',
          supplierName: 'Proveedor Uno',
          issuedAt: dateOf(today),
          dueAt: dateOf(shift(today, 45)),
          subtotal: 200,
          igv: 36,
          total: 236,
        },
      });
      await db.payable.create({
        data: {
          supplierInvoiceId: 'sinv-1',
          documentNumber: 'FP-0001',
          supplierId: 'sup-1',
          supplierName: 'Proveedor Uno',
          issuedAt: dateOf(today),
          dueAt: dateOf(shift(today, 45)),
          amount: 236,
          balance: 236,
        },
      });
    });

    it('aggregates the dashboard of every readable module', async () => {
      const summary = await summaryOf();
      expect(kpiOf(summary, 'monthly-sales')).toBe(150);
      expect(kpiOf(summary, 'receivables')).toBe(118);
      expect(kpiOf(summary, 'payables')).toBe(236);
      expect(kpiOf(summary, 'monthly-purchases')).toBe(200);
      expect(kpiOf(summary, 'critical-stock')).toBe(1);
      expect(summary.monthlyTotals.at(-1)).toMatchObject({ sales: 150, purchases: 200 });
      // Like the frontend, the latest sales include the cancelled ones with their status.
      expect(summary.recentSales.map((row) => row.number)).toEqual([
        'V-00003',
        'V-00002',
        'V-00001',
      ]);
    });

    it('filters the dashboard and the alerts by the modules of the role', async () => {
      const compras = await ctx.tokenFor('role-compras');
      const purchasing = await summaryOf(compras);
      expect(kpiIds(purchasing)).toEqual(expect.arrayContaining(['payables', 'critical-stock']));
      expect(kpiIds(purchasing)).not.toContain('monthly-sales');
      expect(kpiIds(purchasing)).not.toContain('receivables');
      expect(purchasing.recentSales).toEqual([]);

      const ventas = await ctx.tokenFor('role-ventas');
      expect(kpiIds(await summaryOf(ventas))).not.toContain('payables');

      const all = bodyOf<AlertBody[]>(await get('/alerts').expect(200)).map((alert) => alert.id);
      expect(all).toEqual(
        expect.arrayContaining(['receivables-overdue', 'sales-to-invoice', 'stock-critical']),
      );
      const purchasingAlerts = bodyOf<AlertBody[]>(await get('/alerts', compras).expect(200));
      expect(purchasingAlerts.map((alert) => alert.id)).toEqual(['stock-critical']);
      const tesoreria = await ctx.tokenFor('role-tesoreria');
      const treasuryAlerts = bodyOf<AlertBody[]>(await get('/alerts', tesoreria).expect(200));
      expect(treasuryAlerts.some((alert) => alert.path.startsWith('/inventario'))).toBe(false);
    });

    it('runs the sales and purchases reports with dates and party', async () => {
      const sales = await reportOf('ventas');
      expect(sales.rows.map((row) => row['number'])).toEqual(['V-00003', 'V-00001']);
      expect(kpiValues(sales)).toEqual([2, 150, 177, 88.5]);
      expect(sales.chart).toEqual([{ label: 'Andes SAC', value: 177 }]);
      expect((await reportOf(`ventas?party=cus-1&from=${today}&to=${today}`)).rows).toHaveLength(2);
      expect((await reportOf(`ventas?from=${shift(today, 1)}`)).rows).toEqual([]);

      const purchases = await reportOf('compras?party=sup-1');
      expect(purchases.rows).toEqual([expect.objectContaining({ number: 'FP-0001', total: 236 })]);
      expect(kpiValues(purchases)).toEqual([1, 200, 236, 236]);
    });

    it('runs the inventory report by warehouse', async () => {
      const stock = await reportOf('inventario');
      expect(stock.rows).toHaveLength(2);
      expect(kpiValues(stock)).toEqual([2, 12, 120, 1]);
      const north = await reportOf('inventario?party=wh-2');
      expect(north.rows).toEqual([expect.objectContaining({ warehouse: 'Norte', quantity: 10 })]);
    });

    it('runs the aging report as of today in Lima', async () => {
      const aging = await reportOf('saldos');
      expect(aging.title).toBe(`Antigüedad de saldos al ${today}`);
      expect(aging.rows).toEqual([
        expect.objectContaining({
          documentNumber: 'F001-00000001',
          late: 10,
          bucket: '1 a 30 días',
        }),
        expect.objectContaining({ documentNumber: 'FP-0001', late: 0, bucket: 'Por vencer' }),
      ]);
      expect(kpiValues(aging)).toEqual([118, 118, 236, 0]);
      expect(aging.chart.map((point) => point.value)).toEqual([236, 118, 0, 0, 0]);
      expect((await reportOf('saldos?party=pagar')).rows).toHaveLength(1);
    });

    it('lists the filters of each report', async () => {
      const filtersOf = async (report: string) =>
        bodyOf<FiltersBody>(await get(`/reports/${report}/filters`).expect(200));
      expect((await filtersOf('ventas')).party?.options).toEqual([
        { value: 'cus-1', label: 'Andes SAC' },
      ]);
      expect((await filtersOf('compras')).party?.options).toEqual([
        { value: 'sup-1', label: 'Proveedor Uno' },
      ]);
      expect(await filtersOf('inventario')).toMatchObject({
        dates: false,
        party: { options: [{ value: 'wh-1' }, { value: 'wh-2' }] },
      });
      expect((await filtersOf('saldos')).party?.options.map((option) => option.value)).toEqual([
        'cobrar',
        'pagar',
      ]);
    });
  });

  describe('errors', () => {
    it('requires a session and the reportes module', async () => {
      await ctx.http.get(`${API}/dashboard/summary`).expect(401);
      await ctx.prisma.role.create({
        data: {
          id: 'role-sin-reportes',
          name: 'Sin reportes',
          permissions: {
            create: [
              { module: 'comercial', access: 'read' },
              { module: 'reportes', access: 'none' },
            ],
          },
        },
      });
      const user = await ctx.createUser('role-consulta');
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { roleId: 'role-sin-reportes' },
      });
      const token = (await ctx.signIn(user)).token;
      await get('/dashboard/summary', token).expect(403);
      await get('/alerts', token).expect(403);
      await get('/reports/ventas', token).expect(403);
      await get('/reports/ventas/filters', token).expect(403);
    });

    it('rejects an unknown report and invalid filters', async () => {
      await get('/reports/otro').expect(404);
      await get('/reports/otro/filters').expect(404);
      const invalidDate = bodyOf<ErrorBody>(
        await get('/reports/ventas?from=2026-13-01').expect(422),
      );
      expect(invalidDate.statusCode).toBe(422);
      await get(`/reports/compras?from=${today}&to=${shift(today, -1)}`).expect(422);
      await get('/reports/saldos?party=ambos').expect(422);
      await get('/reports/ventas?party=nadie').expect(422);
    });
  });
});
