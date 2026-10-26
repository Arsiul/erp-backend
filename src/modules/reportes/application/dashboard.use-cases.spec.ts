import type { Permissions } from '../../../shared/domain/authorization/access-level';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type { DayRange } from '../domain/periods';
import type { ComparisonInput, DashboardQueries } from '../domain/ports/reportes.ports';
import { DashboardUseCases, RECENT_SALES, TOP_PRODUCTS } from './dashboard.use-cases';

const FIXED_CLOCK: Clock = { now: () => new Date('2026-10-25T15:00:00Z') };

const NONE: Permissions = {
  maestros: 'none',
  comercial: 'none',
  compras: 'none',
  inventario: 'none',
  tesoreria: 'none',
  documentos: 'none',
  reportes: 'read',
  administracion: 'none',
};

class FakeDashboardQueries implements DashboardQueries {
  readonly calls: string[] = [];
  comparison?: ComparisonInput;
  chartRange?: DayRange;
  topRange?: DayRange;
  costRange?: DayRange;
  limits: number[] = [];

  commercialFigures(input: ComparisonInput) {
    this.calls.push('commercialFigures');
    this.comparison = input;
    return Promise.resolve({
      sales: 1000,
      previousSales: 500,
      costOfSales: 400,
      previousCostOfSales: 200,
      receivableBalance: 300,
      overdueReceivables: 1,
    });
  }

  purchasingFigures() {
    this.calls.push('purchasingFigures');
    return Promise.resolve({
      payableBalance: 200,
      overduePayables: 0,
      purchases: 700,
      previousPurchases: 700,
    });
  }

  inventoryFigures(costRange: DayRange) {
    this.calls.push('inventoryFigures');
    this.costRange = costRange;
    return Promise.resolve({ criticalItems: 2, inventoryValue: 1200, lastMonthCostOfSales: 100 });
  }

  monthlySales(range: DayRange) {
    this.calls.push('monthlySales');
    this.chartRange = range;
    return Promise.resolve(new Map([['2026-10', 1000]]));
  }

  monthlyPurchases() {
    this.calls.push('monthlyPurchases');
    return Promise.resolve(new Map([['2026-09', 700]]));
  }

  recentSales(limit: number) {
    this.calls.push('recentSales');
    this.limits.push(limit);
    return Promise.resolve([]);
  }

  topProducts(range: DayRange, limit: number) {
    this.calls.push('topProducts');
    this.topRange = range;
    this.limits.push(limit);
    return Promise.resolve([
      { id: 'p1', name: 'Producto', category: 'Cat', units: 3, revenue: 90 },
    ]);
  }
}

describe('DashboardUseCases', () => {
  it('queries every module a full reader can see, with Lima periods', async () => {
    const queries = new FakeDashboardQueries();
    const summary = await new DashboardUseCases(queries, FIXED_CLOCK).summary({
      ...NONE,
      comercial: 'write',
      compras: 'read',
      inventario: 'read',
    });

    expect(queries.calls.sort()).toEqual([
      'commercialFigures',
      'inventoryFigures',
      'monthlyPurchases',
      'monthlySales',
      'purchasingFigures',
      'recentSales',
      'topProducts',
    ]);
    expect(queries.comparison).toEqual({
      today: '2026-10-25',
      current: { from: '2026-10-01', to: '2026-10-25' },
      previous: { from: '2026-09-01', to: '2026-09-25' },
    });
    expect(queries.chartRange).toEqual({ from: '2026-05-01', to: '2026-10-31' });
    expect(queries.topRange).toEqual({ from: '2026-09-26', to: '2026-10-25' });
    expect(queries.costRange).toEqual(queries.topRange);
    expect(queries.limits).toEqual(expect.arrayContaining([RECENT_SALES, TOP_PRODUCTS]));
    expect(summary.primaryKpis.map((kpi) => kpi.id)).toEqual([
      'monthly-sales',
      'gross-profit',
      'receivables',
      'payables',
    ]);
    expect(summary.operationalKpis).toHaveLength(3);
    expect(summary.monthlyTotals[4]).toMatchObject({ sales: 0, purchases: 700 });
    expect(summary.topProducts).toHaveLength(1);
  });

  it('leaves out the modules the role cannot read', async () => {
    const queries = new FakeDashboardQueries();
    const summary = await new DashboardUseCases(queries, FIXED_CLOCK).summary({
      ...NONE,
      compras: 'read',
    });

    expect(queries.calls.sort()).toEqual(['monthlyPurchases', 'purchasingFigures']);
    expect(summary.primaryKpis.map((kpi) => kpi.id)).toEqual(['payables']);
    expect(summary.operationalKpis.map((kpi) => kpi.id)).toEqual(['monthly-purchases']);
    expect(summary.recentSales).toEqual([]);
  });

  it('queries nothing for a role without operational modules', async () => {
    const queries = new FakeDashboardQueries();
    const summary = await new DashboardUseCases(queries, FIXED_CLOCK).summary(NONE);

    expect(queries.calls).toEqual([]);
    expect(summary.primaryKpis).toEqual([]);
    expect(summary.monthlyTotals).toEqual([]);
  });
});
