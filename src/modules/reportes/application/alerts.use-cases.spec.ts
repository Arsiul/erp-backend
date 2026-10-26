import type { Permissions } from '../../../shared/domain/authorization/access-level';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type { AlertQueries } from '../domain/ports/reportes.ports';
import { AlertsUseCases } from './alerts.use-cases';

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

class FakeAlertQueries implements AlertQueries {
  readonly days: string[] = [];
  readonly calls: string[] = [];

  commercial(today: string) {
    this.calls.push('commercial');
    this.days.push(today);
    return Promise.resolve({
      overdueReceivables: 1,
      overdueReceivableBalance: 118,
      salesToInvoice: 0,
      expiringQuotes: 0,
    });
  }

  purchasing(today: string) {
    this.calls.push('purchasing');
    this.days.push(today);
    return Promise.resolve({
      overduePayables: 0,
      overduePayableBalance: 0,
      payablesDueSoon: 0,
      payablesDueSoonBalance: 0,
      receiptsToBill: 2,
    });
  }

  inventory() {
    this.calls.push('inventory');
    return Promise.resolve({ criticalItems: 2, emptyItems: 1, pendingTransfers: 0 });
  }
}

describe('AlertsUseCases', () => {
  it('raises the alerts of every readable module as of today in Lima', async () => {
    const queries = new FakeAlertQueries();
    const alerts = await new AlertsUseCases(queries, FIXED_CLOCK).list({
      ...NONE,
      comercial: 'read',
      compras: 'write',
      inventario: 'read',
    });

    expect(queries.calls.sort()).toEqual(['commercial', 'inventory', 'purchasing']);
    expect(queries.days).toEqual(['2026-10-25', '2026-10-25']);
    expect(alerts.map((alert) => alert.path.split('/')[1]).sort()).toEqual([
      'comercial',
      'compras',
      'inventario',
    ]);
  });

  it('does not query the modules the role cannot read', async () => {
    const queries = new FakeAlertQueries();
    const alerts = await new AlertsUseCases(queries, FIXED_CLOCK).list({
      ...NONE,
      inventario: 'read',
    });

    expect(queries.calls).toEqual(['inventory']);
    expect(alerts.every((alert) => alert.path.startsWith('/inventario'))).toBe(true);
  });

  it('returns no alerts for a role without operational modules', async () => {
    const queries = new FakeAlertQueries();
    expect(await new AlertsUseCases(queries, FIXED_CLOCK).list(NONE)).toEqual([]);
    expect(queries.calls).toEqual([]);
  });
});
