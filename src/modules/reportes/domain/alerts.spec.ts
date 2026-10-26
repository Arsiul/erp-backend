import { formatCurrency } from '../../../shared/domain/money/currency-format';
import { buildAlerts, resourcePath } from './alerts';

const NO_COMMERCIAL = {
  overdueReceivables: 0,
  overdueReceivableBalance: 0,
  salesToInvoice: 0,
  expiringQuotes: 0,
};
const NO_PURCHASING = {
  overduePayables: 0,
  overduePayableBalance: 0,
  payablesDueSoon: 0,
  payablesDueSoonBalance: 0,
  receiptsToBill: 0,
};
const NO_INVENTORY = { criticalItems: 0, emptyItems: 0, pendingTransfers: 0 };

describe('alerts', () => {
  it('builds the route of a resource', () => {
    expect(resourcePath('ventas')).toBe('/comercial/ventas');
    expect(resourcePath('cuentas-pagar')).toBe('/compras/cuentas-pagar');
    expect(resourcePath('stock')).toBe('/inventario/stock');
  });

  it('returns nothing without figures or with every count at zero', () => {
    expect(buildAlerts({})).toEqual([]);
    expect(
      buildAlerts({
        commercial: NO_COMMERCIAL,
        purchasing: NO_PURCHASING,
        inventory: NO_INVENTORY,
      }),
    ).toEqual([]);
  });

  it('lists the commercial alerts by severity', () => {
    const alerts = buildAlerts({
      commercial: {
        overdueReceivables: 2,
        overdueReceivableBalance: 1500,
        salesToInvoice: 1,
        expiringQuotes: 3,
      },
    });
    expect(alerts.map((alert) => alert.id)).toEqual([
      'receivables-overdue',
      'quotes-expiring',
      'sales-to-invoice',
    ]);
    expect(alerts[0]).toEqual({
      id: 'receivables-overdue',
      severity: 'critical',
      title: '2 cobros vencidos',
      description: `${formatCurrency(1500)} pendientes de clientes.`,
      path: '/comercial/cuentas-cobrar',
    });
    expect(alerts[1]?.title).toBe('3 cotizaciones por vencer');
    expect(alerts[2]?.title).toBe('1 venta por facturar');
  });

  it('lists the purchasing alerts', () => {
    const alerts = buildAlerts({
      purchasing: {
        overduePayables: 1,
        overduePayableBalance: 200,
        payablesDueSoon: 2,
        payablesDueSoonBalance: 300,
        receiptsToBill: 1,
      },
    });
    expect(alerts.map((alert) => alert.title)).toEqual([
      '1 pago vencido',
      '2 pagos vencen esta semana',
      '1 recepción sin factura',
    ]);
    expect(alerts[1]?.description).toBe(
      `${formatCurrency(300)} a proveedores en los próximos 7 días.`,
    );
    expect(alerts[2]?.path).toBe('/compras/recepciones');
  });

  it('marks the critical stock as critical only when something ran out', () => {
    const [low] = buildAlerts({ inventory: { ...NO_INVENTORY, criticalItems: 1 } });
    expect(low).toMatchObject({
      severity: 'warning',
      title: '1 producto bajo el mínimo',
      description: 'Programa una compra o una transferencia.',
    });
    const [empty, transfers] = buildAlerts({
      inventory: { criticalItems: 3, emptyItems: 2, pendingTransfers: 1 },
    });
    expect(empty).toMatchObject({
      severity: 'critical',
      title: '3 productos bajo el mínimo',
      description: '2 sin stock en algún almacén.',
    });
    expect(transfers).toMatchObject({
      id: 'transfers-pending',
      title: '1 transferencia pendiente',
      path: '/inventario/transferencias',
    });
  });

  it('does not expose the internal count', () => {
    const [alert] = buildAlerts({ inventory: { ...NO_INVENTORY, pendingTransfers: 4 } });
    expect(Object.keys(alert ?? {}).sort()).toEqual([
      'description',
      'id',
      'path',
      'severity',
      'title',
    ]);
  });
});
