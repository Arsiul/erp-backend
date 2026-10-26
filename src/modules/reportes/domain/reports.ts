import { round2 } from '../../../shared/domain/money/money';
import { daysBetween } from '../../../shared/domain/time/lima-time';

export const REPORT_IDS = ['ventas', 'compras', 'inventario', 'saldos'] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export const isReportId = (value: string): value is ReportId =>
  (REPORT_IDS as readonly string[]).includes(value);

/** Most rows a report returns; beyond it the user has to narrow the filters. */
export const ROW_LIMIT = 10_000;

/** Bars of the "top" charts. */
export const CHART_LIMIT = 8;

export type ColumnKind = 'text' | 'code' | 'number' | 'money' | 'date' | 'percent';

export interface ReportColumn {
  readonly id: string;
  readonly header: string;
  readonly kind: ColumnKind;
}

export type ReportRow = Readonly<Record<string, string | number | null>>;

export interface ReportKpi {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly kind: 'number' | 'money';
}

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

/** Same shape as `ReportResult` of the frontend. */
export interface ReportResult {
  readonly title: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
  readonly kpis: readonly ReportKpi[];
  readonly chart: readonly ChartPoint[];
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export interface ReportFilterSpec {
  readonly dates: boolean;
  readonly party?: { readonly label: string; readonly options: readonly FilterOption[] };
}

export const SALE_STATUS: Readonly<Record<string, string>> = {
  pending_invoice: 'Por facturar',
  invoiced: 'Facturada',
  cancelled: 'Anulada',
};

export const AGING_BUCKETS = [
  'Por vencer',
  '1 a 30 días',
  '31 a 60 días',
  '61 a 90 días',
  'Más de 90 días',
] as const;

/** Index in `AGING_BUCKETS` for a balance `late` days past due (≤ 0: not due yet). */
export type AgingBucketIndex = 0 | 1 | 2 | 3 | 4;

export function agingBucket(late: number): AgingBucketIndex {
  if (late <= 0) return 0;
  if (late <= 30) return 1;
  if (late <= 60) return 2;
  if (late <= 90) return 3;
  return 4;
}

/** A sale or a supplier invoice as the adapter reads it. */
export interface DocumentRow {
  readonly number: string;
  readonly issuedAt: string;
  readonly party: string;
  /** Sale status, or the receipt number of a supplier invoice. */
  readonly reference: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
}

/** Totals over every row that matches the filters, aggregated in SQL. */
export interface DocumentTotals {
  readonly count: number;
  readonly subtotal: number;
  readonly total: number;
}

export interface DocumentData {
  readonly rows: readonly DocumentRow[];
  readonly totals: DocumentTotals;
  /** Σ total per party, largest first, already limited to `CHART_LIMIT`. */
  readonly chart: readonly ChartPoint[];
}

export interface StockRow {
  readonly sku: string;
  readonly product: string;
  readonly category: string;
  readonly warehouse: string;
  readonly quantity: number;
  readonly minStock: number;
  readonly unitCost: number;
}

export interface StockTotals {
  readonly items: number;
  readonly units: number;
  readonly value: number;
  readonly low: number;
}

export interface StockData {
  readonly rows: readonly StockRow[];
  readonly totals: StockTotals;
  /** Σ value per category, largest first, already limited to `CHART_LIMIT`. */
  readonly chart: readonly ChartPoint[];
}

export type BalanceSide = 'cobrar' | 'pagar';

export const isBalanceSide = (value: string): value is BalanceSide =>
  value === 'cobrar' || value === 'pagar';

export interface BalanceRow {
  readonly side: BalanceSide;
  readonly documentNumber: string;
  readonly party: string;
  readonly dueAt: string;
  readonly balance: number;
}

export interface BalanceTotals {
  readonly receivable: number;
  readonly receivableOverdue: number;
  readonly payable: number;
  readonly payableOverdue: number;
}

export interface BalanceData {
  readonly rows: readonly BalanceRow[];
  readonly totals: BalanceTotals;
  /** Σ balance per aging bucket, indexed like `AGING_BUCKETS` (missing buckets count as 0). */
  readonly buckets: readonly number[];
}

const DOCUMENT_COLUMNS = (party: string, reference: string): ReportColumn[] => [
  { id: 'number', header: 'Documento', kind: 'code' },
  { id: 'issuedAt', header: 'Fecha', kind: 'date' },
  { id: 'party', header: party, kind: 'text' },
  { id: 'reference', header: reference, kind: 'text' },
  { id: 'subtotal', header: 'Subtotal', kind: 'money' },
  { id: 'igv', header: 'IGV', kind: 'money' },
  { id: 'total', header: 'Total', kind: 'money' },
];

function documentKpis(totals: DocumentTotals, noun: string): ReportKpi[] {
  const total = round2(totals.total);
  return [
    { id: 'count', label: noun, value: totals.count, kind: 'number' },
    { id: 'subtotal', label: 'Subtotal', value: round2(totals.subtotal), kind: 'money' },
    { id: 'total', label: 'Total con IGV', value: total, kind: 'money' },
    {
      id: 'average',
      label: 'Promedio por documento',
      value: totals.count ? round2(total / totals.count) : 0,
      kind: 'money',
    },
  ];
}

const roundedChart = (chart: readonly ChartPoint[]): ChartPoint[] =>
  chart.map((point) => ({ label: point.label, value: round2(point.value) }));

function documentRows(rows: readonly DocumentRow[], reference: (row: DocumentRow) => string) {
  return rows.map<ReportRow>((row) => ({
    number: row.number,
    issuedAt: row.issuedAt,
    party: row.party,
    reference: reference(row),
    subtotal: round2(row.subtotal),
    igv: round2(row.igv),
    total: round2(row.total),
  }));
}

export function salesReport(data: DocumentData): ReportResult {
  return {
    title: 'Ventas del periodo',
    columns: DOCUMENT_COLUMNS('Cliente', 'Estado'),
    rows: documentRows(data.rows, (row) => SALE_STATUS[row.reference] ?? row.reference),
    kpis: documentKpis(data.totals, 'Ventas'),
    chart: roundedChart(data.chart),
  };
}

export function purchasesReport(data: DocumentData): ReportResult {
  return {
    title: 'Compras facturadas del periodo',
    columns: DOCUMENT_COLUMNS('Proveedor', 'Recepción'),
    rows: documentRows(data.rows, (row) => row.reference),
    kpis: documentKpis(data.totals, 'Facturas'),
    chart: roundedChart(data.chart),
  };
}

export function inventoryReport(data: StockData): ReportResult {
  return {
    title: 'Inventario valorizado al día',
    columns: [
      { id: 'sku', header: 'SKU', kind: 'code' },
      { id: 'product', header: 'Producto', kind: 'text' },
      { id: 'category', header: 'Categoría', kind: 'text' },
      { id: 'warehouse', header: 'Almacén', kind: 'text' },
      { id: 'quantity', header: 'Existencia', kind: 'number' },
      { id: 'minStock', header: 'Mínimo', kind: 'number' },
      { id: 'unitCost', header: 'Costo unit.', kind: 'money' },
      { id: 'value', header: 'Valor', kind: 'money' },
    ],
    rows: data.rows.map<ReportRow>((row) => ({
      sku: row.sku,
      product: row.product,
      category: row.category,
      warehouse: row.warehouse,
      quantity: row.quantity,
      minStock: row.minStock,
      unitCost: round2(row.unitCost),
      value: round2(row.quantity * row.unitCost),
    })),
    kpis: [
      { id: 'items', label: 'Productos en almacén', value: data.totals.items, kind: 'number' },
      { id: 'units', label: 'Unidades', value: data.totals.units, kind: 'number' },
      {
        id: 'value',
        label: 'Valor del inventario',
        value: round2(data.totals.value),
        kind: 'money',
      },
      { id: 'low', label: 'Bajo el mínimo', value: data.totals.low, kind: 'number' },
    ],
    chart: roundedChart(data.chart),
  };
}

export function balancesReport(data: BalanceData, today: string): ReportResult {
  return {
    title: `Antigüedad de saldos al ${today}`,
    columns: [
      { id: 'side', header: 'Tipo', kind: 'text' },
      { id: 'documentNumber', header: 'Documento', kind: 'code' },
      { id: 'party', header: 'Cliente o proveedor', kind: 'text' },
      { id: 'dueAt', header: 'Vence', kind: 'date' },
      { id: 'late', header: 'Días vencido', kind: 'number' },
      { id: 'bucket', header: 'Tramo', kind: 'text' },
      { id: 'balance', header: 'Saldo', kind: 'money' },
    ],
    rows: data.rows.map<ReportRow>((row) => {
      const late = daysBetween(row.dueAt, today);
      return {
        side: row.side === 'cobrar' ? 'Por cobrar' : 'Por pagar',
        documentNumber: row.documentNumber,
        party: row.party,
        dueAt: row.dueAt,
        late: Math.max(0, late),
        bucket: AGING_BUCKETS[agingBucket(late)],
        balance: round2(row.balance),
      };
    }),
    kpis: [
      {
        id: 'receivable',
        label: 'Por cobrar',
        value: round2(data.totals.receivable),
        kind: 'money',
      },
      {
        id: 'receivableOverdue',
        label: 'Por cobrar vencido',
        value: round2(data.totals.receivableOverdue),
        kind: 'money',
      },
      { id: 'payable', label: 'Por pagar', value: round2(data.totals.payable), kind: 'money' },
      {
        id: 'payableOverdue',
        label: 'Por pagar vencido',
        value: round2(data.totals.payableOverdue),
        kind: 'money',
      },
    ],
    chart: AGING_BUCKETS.map((label, index) => ({
      label,
      value: round2(data.buckets[index] ?? 0),
    })),
  };
}

const sortedOptions = (options: readonly FilterOption[]): FilterOption[] =>
  [...options].sort((a, b) => a.label.localeCompare(b.label, 'es'));

/** Filters each report offers; `options` are the customers, suppliers or warehouses it lists. */
export function filterSpec(report: ReportId, options: readonly FilterOption[]): ReportFilterSpec {
  switch (report) {
    case 'ventas':
      return { dates: true, party: { label: 'Cliente', options: sortedOptions(options) } };
    case 'compras':
      return { dates: true, party: { label: 'Proveedor', options: sortedOptions(options) } };
    case 'inventario':
      return { dates: false, party: { label: 'Almacén', options: sortedOptions(options) } };
    case 'saldos':
      return {
        dates: true,
        party: {
          label: 'Tipo de saldo',
          options: [
            { value: 'cobrar', label: 'Por cobrar' },
            { value: 'pagar', label: 'Por pagar' },
          ],
        },
      };
  }
}
