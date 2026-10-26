import { INVALID_DATE } from '../../../shared/application/listing/list-query';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type {
  BalanceCriteria,
  DocumentCriteria,
  PartyKind,
  ReportParties,
  ReportQueries,
  StockCriteria,
} from '../domain/ports/reportes.ports';
import { type BalanceData, type DocumentData, ROW_LIMIT, type StockData } from '../domain/reports';
import {
  INVALID_RANGE,
  INVALID_SIDE,
  MISSING_PARTY,
  REPORT_NOT_FOUND,
  ReportsUseCases,
  TOO_MANY_ROWS,
} from './reports.use-cases';

const FIXED_CLOCK: Clock = { now: () => new Date('2026-10-25T15:00:00Z') };

const DOCUMENTS: DocumentData = {
  rows: [
    {
      number: 'V-0001',
      issuedAt: '2026-10-20',
      party: 'Cliente',
      reference: 'issued',
      subtotal: 100,
      igv: 18,
      total: 118,
    },
  ],
  totals: { count: 1, subtotal: 100, total: 118 },
  chart: [{ label: 'Cliente', value: 118 }],
};

const STOCK: StockData = {
  rows: [
    {
      sku: 'SKU-1',
      product: 'Producto',
      category: 'Cat',
      warehouse: 'Central',
      quantity: 2,
      minStock: 1,
      unitCost: 5,
    },
  ],
  totals: { items: 1, units: 2, value: 10, low: 0 },
  chart: [{ label: 'Cat', value: 10 }],
};

const BALANCES: BalanceData = {
  rows: [
    {
      side: 'cobrar',
      documentNumber: 'F001-1',
      party: 'Cliente',
      dueAt: '2026-10-01',
      balance: 50,
    },
  ],
  totals: { receivable: 50, receivableOverdue: 50, payable: 0, payableOverdue: 0 },
  buckets: [0, 50, 0, 0, 0],
};

class FakeReportQueries implements ReportQueries {
  documentCriteria?: DocumentCriteria;
  stockCriteria?: StockCriteria;
  balanceCriteria?: BalanceCriteria;
  overflow = false;

  sales(criteria: DocumentCriteria) {
    this.documentCriteria = criteria;
    return Promise.resolve(this.sized(DOCUMENTS));
  }

  purchases(criteria: DocumentCriteria) {
    this.documentCriteria = criteria;
    return Promise.resolve(this.sized(DOCUMENTS));
  }

  inventory(criteria: StockCriteria) {
    this.stockCriteria = criteria;
    return Promise.resolve(this.sized(STOCK));
  }

  balances(criteria: BalanceCriteria) {
    this.balanceCriteria = criteria;
    return Promise.resolve(this.sized(BALANCES));
  }

  private sized<T extends { readonly rows: readonly unknown[] }>(data: T): T {
    const [row] = data.rows;
    return this.overflow
      ? { ...data, rows: Array.from({ length: ROW_LIMIT + 1 }, () => row) }
      : data;
  }
}

class FakeReportParties implements ReportParties {
  readonly known = new Set(['customer:c1', 'supplier:s1', 'warehouse:w1']);
  requested?: PartyKind;

  exists(kind: PartyKind, id: string) {
    return Promise.resolve(this.known.has(`${kind}:${id}`));
  }

  options(kind: PartyKind) {
    this.requested = kind;
    return Promise.resolve([{ value: `${kind}-1`, label: kind }]);
  }
}

function setup() {
  const queries = new FakeReportQueries();
  const parties = new FakeReportParties();
  return { queries, parties, useCases: new ReportsUseCases(queries, parties, FIXED_CLOCK) };
}

describe('ReportsUseCases', () => {
  describe('run', () => {
    it('rejects an unknown report with 404', async () => {
      const { useCases } = setup();
      await expect(useCases.run('otro', {})).rejects.toEqual(new NotFoundError(REPORT_NOT_FOUND));
    });

    it('runs the sales report with dates and customer', async () => {
      const { useCases, queries } = setup();
      const report = await useCases.run('ventas', {
        from: ' 2026-10-01 ',
        to: '2026-10-25',
        party: 'c1',
      });
      expect(queries.documentCriteria).toEqual({
        from: '2026-10-01',
        to: '2026-10-25',
        partyId: 'c1',
        limit: ROW_LIMIT + 1,
      });
      expect(report.rows).toHaveLength(1);
      expect(report.title).toBe('Ventas del periodo');
    });

    it('treats empty filters as no filter', async () => {
      const { useCases, queries } = setup();
      await useCases.run('compras', { from: '', to: '  ', party: '' });
      expect(queries.documentCriteria).toEqual({ limit: ROW_LIMIT + 1 });
    });

    it('runs the purchases report for a supplier', async () => {
      const { useCases, queries } = setup();
      const report = await useCases.run('compras', { party: 's1' });
      expect(queries.documentCriteria).toEqual({ partyId: 's1', limit: ROW_LIMIT + 1 });
      expect(report.title).toBe('Compras facturadas del periodo');
    });

    it('rejects a party that does not exist', async () => {
      const { useCases } = setup();
      await expect(useCases.run('ventas', { party: 'x' })).rejects.toEqual(
        new BusinessError(MISSING_PARTY.customer),
      );
      await expect(useCases.run('compras', { party: 'c1' })).rejects.toEqual(
        new BusinessError(MISSING_PARTY.supplier),
      );
      await expect(useCases.run('inventario', { party: 'x' })).rejects.toEqual(
        new BusinessError(MISSING_PARTY.warehouse),
      );
    });

    it('rejects malformed dates and inverted ranges', async () => {
      const { useCases } = setup();
      await expect(useCases.run('ventas', { from: '25/10/2026' })).rejects.toEqual(
        new BusinessError(INVALID_DATE),
      );
      await expect(useCases.run('saldos', { to: '2026-02-30' })).rejects.toEqual(
        new BusinessError(INVALID_DATE),
      );
      await expect(
        useCases.run('compras', { from: '2026-10-25', to: '2026-10-01' }),
      ).rejects.toEqual(new BusinessError(INVALID_RANGE));
    });

    it('runs the inventory report, ignoring dates', async () => {
      const { useCases, queries } = setup();
      const report = await useCases.run('inventario', { from: 'basura', party: 'w1' });
      expect(queries.stockCriteria).toEqual({ warehouseId: 'w1', limit: ROW_LIMIT + 1 });
      expect(report.kpis.map((kpi) => kpi.value)).toEqual([1, 2, 10, 0]);
    });

    it('runs the inventory report for every warehouse', async () => {
      const { useCases, queries } = setup();
      await useCases.run('inventario', {});
      expect(queries.stockCriteria).toEqual({ limit: ROW_LIMIT + 1 });
    });

    it('runs the aging report as of today, by side', async () => {
      const { useCases, queries } = setup();
      const report = await useCases.run('saldos', { from: '2026-01-01', party: 'cobrar' });
      expect(queries.balanceCriteria).toEqual({
        from: '2026-01-01',
        side: 'cobrar',
        today: '2026-10-25',
        limit: ROW_LIMIT + 1,
      });
      expect(report.title).toBe('Antigüedad de saldos al 2026-10-25');
      expect(report.rows[0]).toMatchObject({ late: 24, bucket: '1 a 30 días' });
    });

    it('runs the aging report for both sides', async () => {
      const { useCases, queries } = setup();
      await useCases.run('saldos', {});
      expect(queries.balanceCriteria).toEqual({ today: '2026-10-25', limit: ROW_LIMIT + 1 });
    });

    it('rejects an unknown balance side', async () => {
      const { useCases } = setup();
      await expect(useCases.run('saldos', { party: 'ambos' })).rejects.toEqual(
        new BusinessError(INVALID_SIDE),
      );
    });

    it.each(['ventas', 'compras', 'inventario', 'saldos'])(
      'refuses a %s report beyond the row limit',
      async (report) => {
        const { useCases, queries } = setup();
        queries.overflow = true;
        await expect(useCases.run(report, {})).rejects.toEqual(new BusinessError(TOO_MANY_ROWS));
      },
    );
  });

  describe('filters', () => {
    it('rejects an unknown report with 404', async () => {
      const { useCases } = setup();
      await expect(useCases.filters('otro')).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each([
      ['ventas', 'customer', 'Cliente'],
      ['compras', 'supplier', 'Proveedor'],
      ['inventario', 'warehouse', 'Almacén'],
    ] as const)('lists the parties of %s', async (report, kind, label) => {
      const { useCases, parties } = setup();
      const spec = await useCases.filters(report);
      expect(parties.requested).toBe(kind);
      expect(spec.party).toEqual({ label, options: [{ value: `${kind}-1`, label: kind }] });
    });

    it('offers the balance sides without querying parties', async () => {
      const { useCases, parties } = setup();
      const spec = await useCases.filters('saldos');
      expect(parties.requested).toBeUndefined();
      expect(spec.party?.options.map((option) => option.value)).toEqual(['cobrar', 'pagar']);
    });
  });
});
