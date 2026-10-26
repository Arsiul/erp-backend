import {
  buildSummary,
  change,
  type CommercialFigures,
  commercialKpis,
  type DashboardData,
  inventoryKpis,
  monthlyTotals,
  purchasingKpis,
  type PurchasingFigures,
} from './dashboard';
import { lastSixMonths } from './periods';

const TODAY = '2026-10-25';

const COMMERCIAL: CommercialFigures = {
  sales: 1000,
  previousSales: 800,
  costOfSales: 600,
  previousCostOfSales: 500,
  receivableBalance: 1180.004,
  overdueReceivables: 2,
};

const PURCHASING: PurchasingFigures = {
  payableBalance: 590,
  overduePayables: 1,
  purchases: 500,
  previousPurchases: 0,
};

describe('dashboard', () => {
  it('computes the change against the previous period', () => {
    expect(change(110, 100)).toBe(10);
    expect(change(100, 300)).toBe(-66.7);
    expect(change(5, 0)).toBeNull();
  });

  it('builds the commercial KPIs', () => {
    const [sales, profit, receivables] = commercialKpis(COMMERCIAL);
    expect(sales).toMatchObject({ id: 'monthly-sales', value: 1000, changePercent: 25 });
    expect(profit).toMatchObject({
      id: 'gross-profit',
      value: 400,
      changePercent: 33.3,
      caption: 'Margen de 40 %',
    });
    expect(receivables).toMatchObject({
      id: 'receivables',
      value: 1180,
      changePercent: null,
      caption: '2 comprobantes vencidos',
    });
  });

  it('describes a month without sales or overdue documents', () => {
    const [, profit, receivables] = commercialKpis({
      ...COMMERCIAL,
      sales: 0,
      costOfSales: 0,
      overdueReceivables: 0,
    });
    expect(profit?.caption).toBe('Sin ventas en el mes');
    expect(receivables?.caption).toBe('Nada vencido');
  });

  it('builds the purchasing KPIs', () => {
    const { payables, purchases } = purchasingKpis(PURCHASING);
    expect(payables).toMatchObject({ value: 590, caption: '1 factura vencida' });
    expect(purchases).toMatchObject({ id: 'monthly-purchases', value: 500, changePercent: null });
    expect(purchasingKpis({ ...PURCHASING, overduePayables: 0 }).payables.caption).toBe(
      'Nada vencido',
    );
  });

  it('builds the inventory KPIs', () => {
    const [critical, turnover] = inventoryKpis({
      criticalItems: 3,
      inventoryValue: 1200,
      lastMonthCostOfSales: 300,
    });
    expect(critical).toMatchObject({ value: 3, caption: 'Productos por almacén bajo el mínimo' });
    expect(turnover).toMatchObject({ value: 3, unit: 'veces/año', format: 'decimal' });
    const [calm, idle] = inventoryKpis({
      criticalItems: 0,
      inventoryValue: 0,
      lastMonthCostOfSales: 300,
    });
    expect(calm?.caption).toBe('Todo sobre el mínimo');
    expect(idle?.value).toBe(0);
  });

  it('fills every month, with zeros for the hidden side', () => {
    const months = lastSixMonths(TODAY);
    const totals = monthlyTotals(months, new Map([['2026-10', 10.126]]), null);
    expect(totals).toHaveLength(6);
    expect(totals[5]).toEqual({ month: months[5]?.label, sales: 10.13, purchases: 0 });
    expect(totals[0]).toEqual({ month: months[0]?.label, sales: 0, purchases: 0 });
  });

  it('builds the full summary for a role that sees everything', () => {
    const data: DashboardData = {
      today: TODAY,
      months: lastSixMonths(TODAY),
      commercial: {
        figures: COMMERCIAL,
        monthlySales: new Map([['2026-10', 1000]]),
        recentSales: [
          {
            id: 's1',
            number: 'V-0001',
            customerName: 'Cliente',
            issuedAt: TODAY,
            total: 1180,
            status: 'invoiced',
            invoiceNumber: 'F001-1',
          },
        ],
        topProducts: [{ id: 'p1', name: 'Producto', category: 'Cat', units: 2, revenue: 99.999 }],
      },
      purchasing: { figures: PURCHASING, monthlyPurchases: new Map([['2026-09', 300]]) },
      inventory: { criticalItems: 0, inventoryValue: 0, lastMonthCostOfSales: 0 },
    };
    const summary = buildSummary(data);
    expect(summary.periodLabel).toBe('octubre de 2026');
    expect(summary.primaryKpis.map((kpi) => kpi.id)).toEqual([
      'monthly-sales',
      'gross-profit',
      'receivables',
      'payables',
    ]);
    expect(summary.operationalKpis.map((kpi) => kpi.id)).toEqual([
      'monthly-purchases',
      'critical-stock',
      'inventory-turnover',
    ]);
    expect(summary.monthlyTotals[4]).toMatchObject({ sales: 0, purchases: 300 });
    expect(summary.monthlyTotals[5]).toMatchObject({ sales: 1000, purchases: 0 });
    expect(summary.recentSales).toHaveLength(1);
    expect(summary.topProducts[0]?.revenue).toBe(100);
  });

  it('leaves out what the role cannot read', () => {
    expect(buildSummary({ today: TODAY, months: lastSixMonths(TODAY) })).toEqual({
      periodLabel: 'octubre de 2026',
      primaryKpis: [],
      operationalKpis: [],
      monthlyTotals: [],
      recentSales: [],
      topProducts: [],
    });
  });
});
