import {
  agingBucket,
  balancesReport,
  type DocumentData,
  type DocumentRow,
  filterSpec,
  inventoryReport,
  isBalanceSide,
  isReportId,
  purchasesReport,
  salesReport,
} from './reports';

const SALE_ROW: DocumentRow = {
  number: 'V-0001',
  issuedAt: '2026-10-20',
  party: 'Cliente',
  reference: 'invoiced',
  subtotal: 100.004,
  igv: 18,
  total: 118.004,
};

const DOCUMENTS: DocumentData = {
  rows: [
    SALE_ROW,
    {
      number: 'V-0002',
      issuedAt: '2026-10-21',
      party: 'Otro',
      reference: 'raro',
      subtotal: 50,
      igv: 9,
      total: 59,
    },
  ],
  totals: { count: 2, subtotal: 150.004, total: 177.004 },
  chart: [{ label: 'Cliente', value: 118.004 }],
};

describe('reports', () => {
  it('recognises the report ids and balance sides', () => {
    expect(isReportId('ventas')).toBe(true);
    expect(isReportId('otro')).toBe(false);
    expect(isBalanceSide('pagar')).toBe(true);
    expect(isBalanceSide('x')).toBe(false);
  });

  it('places a balance in its aging bucket', () => {
    expect([-3, 0, 1, 30, 31, 60, 61, 90, 91].map(agingBucket)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });

  it('builds the sales report', () => {
    const report = salesReport(DOCUMENTS);
    expect(report.title).toBe('Ventas del periodo');
    expect(report.columns.map((column) => column.header)).toEqual([
      'Documento',
      'Fecha',
      'Cliente',
      'Estado',
      'Subtotal',
      'IGV',
      'Total',
    ]);
    expect(report.rows[0]).toMatchObject({ reference: 'Facturada', subtotal: 100, total: 118 });
    expect(report.rows[1]).toMatchObject({ reference: 'raro' });
    expect(report.kpis).toEqual([
      { id: 'count', label: 'Ventas', value: 2, kind: 'number' },
      { id: 'subtotal', label: 'Subtotal', value: 150, kind: 'money' },
      { id: 'total', label: 'Total con IGV', value: 177, kind: 'money' },
      { id: 'average', label: 'Promedio por documento', value: 88.5, kind: 'money' },
    ]);
    expect(report.chart).toEqual([{ label: 'Cliente', value: 118 }]);
  });

  it('builds the purchases report and an empty one', () => {
    const report = purchasesReport({
      rows: [{ ...SALE_ROW, reference: 'R-0001' }],
      totals: { count: 0, subtotal: 0, total: 0 },
      chart: [],
    });
    expect(report.title).toBe('Compras facturadas del periodo');
    expect(report.columns[2]?.header).toBe('Proveedor');
    expect(report.columns[3]?.header).toBe('Recepción');
    expect(report.rows[0]).toMatchObject({ reference: 'R-0001' });
    expect(report.kpis[0]?.label).toBe('Facturas');
    expect(report.kpis[3]?.value).toBe(0);
  });

  it('builds the inventory report', () => {
    const report = inventoryReport({
      rows: [
        {
          sku: 'SKU-1',
          product: 'Producto',
          category: 'Cat',
          warehouse: 'Central',
          quantity: 3,
          minStock: 5,
          unitCost: 10.333,
        },
      ],
      totals: { items: 1, units: 3, value: 30.999, low: 1 },
      chart: [{ label: 'Cat', value: 30.999 }],
    });
    expect(report.rows[0]).toMatchObject({ unitCost: 10.33, value: 31 });
    expect(report.kpis.map((kpi) => kpi.value)).toEqual([1, 3, 31, 1]);
    expect(report.chart).toEqual([{ label: 'Cat', value: 31 }]);
  });

  it('builds the aging report as of today', () => {
    const report = balancesReport(
      {
        rows: [
          {
            side: 'cobrar',
            documentNumber: 'F001-1',
            party: 'Cliente',
            dueAt: '2026-10-30',
            balance: 100,
          },
          {
            side: 'pagar',
            documentNumber: 'FP-1',
            party: 'Proveedor',
            dueAt: '2026-08-01',
            balance: 50.006,
          },
        ],
        totals: { receivable: 100, receivableOverdue: 0, payable: 50.006, payableOverdue: 50.006 },
        buckets: [100, 0, 0, 50.006],
      },
      '2026-10-25',
    );
    expect(report.title).toBe('Antigüedad de saldos al 2026-10-25');
    expect(report.rows[0]).toMatchObject({ side: 'Por cobrar', late: 0, bucket: 'Por vencer' });
    expect(report.rows[1]).toMatchObject({
      side: 'Por pagar',
      late: 85,
      bucket: '61 a 90 días',
      balance: 50.01,
    });
    expect(report.kpis.map((kpi) => kpi.value)).toEqual([100, 0, 50.01, 50.01]);
    expect(report.chart.map((point) => point.value)).toEqual([100, 0, 0, 50.01, 0]);
  });

  it('describes the filters of each report', () => {
    const options = [
      { value: 'b', label: 'Óptica' },
      { value: 'a', label: 'Alfa' },
    ];
    expect(filterSpec('ventas', options)).toEqual({
      dates: true,
      party: {
        label: 'Cliente',
        options: [
          { value: 'a', label: 'Alfa' },
          { value: 'b', label: 'Óptica' },
        ],
      },
    });
    expect(filterSpec('compras', options).party?.label).toBe('Proveedor');
    expect(filterSpec('inventario', options)).toMatchObject({
      dates: false,
      party: { label: 'Almacén' },
    });
    expect(filterSpec('saldos', options).party?.options).toEqual([
      { value: 'cobrar', label: 'Por cobrar' },
      { value: 'pagar', label: 'Por pagar' },
    ]);
  });
});
