import { round2 } from '../../../shared/domain/money/money';
import { plural } from '../../../shared/domain/text/plural';
import { type MonthSlot, periodLabel } from './periods';

export type KpiId =
  | 'monthly-sales'
  | 'gross-profit'
  | 'receivables'
  | 'payables'
  | 'monthly-purchases'
  | 'critical-stock'
  | 'inventory-turnover';

export type KpiFormat = 'currency' | 'integer' | 'decimal';

/** One dashboard indicator, the same shape as `Kpi` of the frontend. */
export interface Kpi {
  readonly id: KpiId;
  readonly label: string;
  readonly value: number;
  readonly format: KpiFormat;
  readonly unit?: string;
  /** Change against the previous period; null when it does not apply. */
  readonly changePercent: number | null;
  readonly higherIsBetter: boolean;
  readonly caption: string;
}

export interface MonthlyTotals {
  readonly month: string;
  readonly sales: number;
  readonly purchases: number;
}

export interface RecentSale {
  readonly id: string;
  readonly number: string;
  readonly customerName: string;
  readonly issuedAt: string;
  readonly total: number;
  readonly status: string;
  readonly invoiceNumber: string;
}

export interface TopProduct {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly units: number;
  readonly revenue: number;
}

export interface DashboardSummary {
  readonly periodLabel: string;
  readonly primaryKpis: readonly Kpi[];
  readonly operationalKpis: readonly Kpi[];
  readonly monthlyTotals: readonly MonthlyTotals[];
  readonly recentSales: readonly RecentSale[];
  readonly topProducts: readonly TopProduct[];
}

/** Sums of the commercial tables, aggregated in SQL (not rounded yet). */
export interface CommercialFigures {
  /** Subtotal of the non-cancelled sales of the month so far. */
  readonly sales: number;
  readonly previousSales: number;
  /** Cost of the sales of the month: −Σ quantity × unit cost of the sale kardex entries. */
  readonly costOfSales: number;
  readonly previousCostOfSales: number;
  /** Balance of the open receivables (balance > 0, not cancelled). */
  readonly receivableBalance: number;
  /** Open receivables already due. */
  readonly overdueReceivables: number;
}

export interface PurchasingFigures {
  readonly payableBalance: number;
  readonly overduePayables: number;
  /** Subtotal of the non-cancelled supplier invoices of the month so far. */
  readonly purchases: number;
  readonly previousPurchases: number;
}

export interface InventoryFigures {
  /** Stock rows (product per warehouse) under their minimum. */
  readonly criticalItems: number;
  /** Σ quantity × unit cost of every stock row. */
  readonly inventoryValue: number;
  /** Cost of the sales of the last 30 days. */
  readonly lastMonthCostOfSales: number;
}

/** Percentage change rounded to one decimal; null without a base to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function commercialKpis(figures: CommercialFigures): Kpi[] {
  const sales = round2(figures.sales);
  const previousSales = round2(figures.previousSales);
  const profit = round2(sales - round2(figures.costOfSales));
  const previousProfit = round2(previousSales - round2(figures.previousCostOfSales));
  const overdue = figures.overdueReceivables;
  return [
    {
      id: 'monthly-sales',
      label: 'Ventas del mes',
      value: sales,
      format: 'currency',
      changePercent: change(sales, previousSales),
      higherIsBetter: true,
      caption: 'Sin IGV, frente a los mismos días del mes anterior',
    },
    {
      id: 'gross-profit',
      label: 'Utilidad bruta',
      value: profit,
      format: 'currency',
      changePercent: change(profit, previousProfit),
      higherIsBetter: true,
      caption:
        sales > 0
          ? `Margen de ${String(Math.round((profit / sales) * 1000) / 10)} %`
          : 'Sin ventas en el mes',
    },
    {
      id: 'receivables',
      label: 'Por cobrar',
      value: round2(figures.receivableBalance),
      format: 'currency',
      changePercent: null,
      higherIsBetter: false,
      caption: overdue
        ? plural(overdue, 'comprobante vencido', 'comprobantes vencidos')
        : 'Nada vencido',
    },
  ];
}

/** The payables KPI (primary row) and the purchases KPI (operational row). */
export function purchasingKpis(figures: PurchasingFigures): { payables: Kpi; purchases: Kpi } {
  const purchases = round2(figures.purchases);
  const overdue = figures.overduePayables;
  return {
    payables: {
      id: 'payables',
      label: 'Por pagar',
      value: round2(figures.payableBalance),
      format: 'currency',
      changePercent: null,
      higherIsBetter: false,
      caption: overdue ? plural(overdue, 'factura vencida', 'facturas vencidas') : 'Nada vencido',
    },
    purchases: {
      id: 'monthly-purchases',
      label: 'Compras del mes',
      value: purchases,
      format: 'currency',
      changePercent: change(purchases, round2(figures.previousPurchases)),
      higherIsBetter: false,
      caption: 'Facturas de proveedor, sin IGV',
    },
  };
}

export function inventoryKpis(figures: InventoryFigures): Kpi[] {
  const inventoryValue = round2(figures.inventoryValue);
  const annualCost = round2(figures.lastMonthCostOfSales) * 12;
  return [
    {
      id: 'critical-stock',
      label: 'Stock crítico',
      value: figures.criticalItems,
      format: 'integer',
      changePercent: null,
      higherIsBetter: false,
      caption: figures.criticalItems
        ? 'Productos por almacén bajo el mínimo'
        : 'Todo sobre el mínimo',
    },
    {
      id: 'inventory-turnover',
      label: 'Rotación de inventario',
      value: inventoryValue > 0 ? Math.round((annualCost / inventoryValue) * 10) / 10 : 0,
      format: 'decimal',
      unit: 'veces/año',
      changePercent: null,
      higherIsBetter: true,
      caption: 'Costo de ventas de 30 días anualizado / valor del stock',
    },
  ];
}

/** Totals per month (`YYYY-MM` → amount); null when the role cannot see that side. */
export type MonthlyAmounts = ReadonlyMap<string, number> | null;

export function monthlyTotals(
  slots: readonly MonthSlot[],
  sales: MonthlyAmounts,
  purchases: MonthlyAmounts,
): MonthlyTotals[] {
  return slots.map((slot) => ({
    month: slot.label,
    sales: sales ? round2(sales.get(slot.key) ?? 0) : 0,
    purchases: purchases ? round2(purchases.get(slot.key) ?? 0) : 0,
  }));
}

/** What the use case gathered, only for the modules the role can read. */
export interface DashboardData {
  readonly today: string;
  readonly months: readonly MonthSlot[];
  readonly commercial?: {
    readonly figures: CommercialFigures;
    readonly monthlySales: ReadonlyMap<string, number>;
    readonly recentSales: readonly RecentSale[];
    readonly topProducts: readonly TopProduct[];
  };
  readonly purchasing?: {
    readonly figures: PurchasingFigures;
    readonly monthlyPurchases: ReadonlyMap<string, number>;
  };
  readonly inventory?: InventoryFigures;
}

/** Same layout as `dashboardService.getSummary()` of the frontend. */
export function buildSummary(data: DashboardData): DashboardSummary {
  const { commercial, purchasing, inventory } = data;
  const purchasingRow = purchasing ? purchasingKpis(purchasing.figures) : undefined;
  return {
    periodLabel: periodLabel(data.today),
    primaryKpis: [
      ...(commercial ? commercialKpis(commercial.figures) : []),
      ...(purchasingRow ? [purchasingRow.payables] : []),
    ],
    operationalKpis: [
      ...(purchasingRow ? [purchasingRow.purchases] : []),
      ...(inventory ? inventoryKpis(inventory) : []),
    ],
    monthlyTotals:
      commercial || purchasing
        ? monthlyTotals(
            data.months,
            commercial?.monthlySales ?? null,
            purchasing?.monthlyPurchases ?? null,
          )
        : [],
    recentSales: commercial?.recentSales ?? [],
    topProducts: (commercial?.topProducts ?? []).map((product) => ({
      ...product,
      revenue: round2(product.revenue),
    })),
  };
}
