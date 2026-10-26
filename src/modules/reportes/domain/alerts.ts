import { RESOURCE_MODULE, type ResourceKey } from '../../../shared/domain/authorization/resources';
import { formatCurrency } from '../../../shared/domain/money/currency-format';
import { plural } from '../../../shared/domain/text/plural';

export type AlertSeverity = 'critical' | 'warning' | 'info';

/** Same shape as `BusinessAlert` of the frontend. */
export interface BusinessAlert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly description: string;
  readonly path: string;
}

/** Counts and amounts aggregated in SQL for the comercial alerts. */
export interface CommercialAlertFigures {
  readonly overdueReceivables: number;
  readonly overdueReceivableBalance: number;
  readonly salesToInvoice: number;
  readonly expiringQuotes: number;
}

export interface PurchasingAlertFigures {
  readonly overduePayables: number;
  readonly overduePayableBalance: number;
  readonly payablesDueSoon: number;
  readonly payablesDueSoonBalance: number;
  readonly receiptsToBill: number;
}

export interface InventoryAlertFigures {
  readonly criticalItems: number;
  /** Critical rows with no stock at all. */
  readonly emptyItems: number;
  readonly pendingTransfers: number;
}

export interface AlertFigures {
  readonly commercial?: CommercialAlertFigures;
  readonly purchasing?: PurchasingAlertFigures;
  readonly inventory?: InventoryAlertFigures;
}

const SEVERITY_ORDER: Readonly<Record<AlertSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Frontend route of a resource: `/comercial/ventas`, or `/inventario` when they match. */
export function resourcePath(resource: ResourceKey): string {
  const module: string = RESOURCE_MODULE[resource];
  return module === resource ? `/${module}` : `/${module}/${resource}`;
}

type AlertDraft = BusinessAlert & { readonly count: number };

function commercialAlerts(figures: CommercialAlertFigures): AlertDraft[] {
  return [
    {
      id: 'receivables-overdue',
      count: figures.overdueReceivables,
      severity: 'critical',
      title: plural(figures.overdueReceivables, 'cobro vencido', 'cobros vencidos'),
      description: `${formatCurrency(figures.overdueReceivableBalance)} pendientes de clientes.`,
      path: resourcePath('cuentas-cobrar'),
    },
    {
      id: 'sales-to-invoice',
      count: figures.salesToInvoice,
      severity: 'info',
      title: plural(figures.salesToInvoice, 'venta por facturar', 'ventas por facturar'),
      description: 'Emite el comprobante para generar la cuenta por cobrar.',
      path: resourcePath('ventas'),
    },
    {
      id: 'quotes-expiring',
      count: figures.expiringQuotes,
      severity: 'warning',
      title: plural(figures.expiringQuotes, 'cotización por vencer', 'cotizaciones por vencer'),
      description: 'Enviadas al cliente y sin respuesta; vencen en dos días o menos.',
      path: resourcePath('cotizaciones'),
    },
  ];
}

function purchasingAlerts(figures: PurchasingAlertFigures): AlertDraft[] {
  return [
    {
      id: 'payables-overdue',
      count: figures.overduePayables,
      severity: 'critical',
      title: plural(figures.overduePayables, 'pago vencido', 'pagos vencidos'),
      description: `${formatCurrency(figures.overduePayableBalance)} adeudados a proveedores.`,
      path: resourcePath('cuentas-pagar'),
    },
    {
      id: 'payables-due-soon',
      count: figures.payablesDueSoon,
      severity: 'warning',
      title: `${plural(figures.payablesDueSoon, 'pago vence', 'pagos vencen')} esta semana`,
      description: `${formatCurrency(figures.payablesDueSoonBalance)} a proveedores en los próximos 7 días.`,
      path: resourcePath('cuentas-pagar'),
    },
    {
      id: 'receipts-to-bill',
      count: figures.receiptsToBill,
      severity: 'info',
      title: plural(figures.receiptsToBill, 'recepción sin factura', 'recepciones sin factura'),
      description: 'Registra la factura del proveedor para generar la cuenta por pagar.',
      path: resourcePath('recepciones'),
    },
  ];
}

function inventoryAlerts(figures: InventoryAlertFigures): AlertDraft[] {
  const empty = figures.emptyItems;
  return [
    {
      id: 'stock-critical',
      count: figures.criticalItems,
      severity: empty ? 'critical' : 'warning',
      title: plural(figures.criticalItems, 'producto bajo el mínimo', 'productos bajo el mínimo'),
      description: empty
        ? `${plural(empty, 'sin stock', 'sin stock')} en algún almacén.`
        : 'Programa una compra o una transferencia.',
      path: resourcePath('stock'),
    },
    {
      id: 'transfers-pending',
      count: figures.pendingTransfers,
      severity: 'info',
      title: plural(
        figures.pendingTransfers,
        'transferencia pendiente',
        'transferencias pendientes',
      ),
      description: 'Confírmalas al recibir la mercadería en el almacén de destino.',
      path: resourcePath('transferencias'),
    },
  ];
}

/**
 * Alerts of the modules the role can read (only the figures given), skipping the empty ones and
 * ordered by severity, like `alertsService.list()` of the frontend.
 */
export function buildAlerts(figures: AlertFigures): BusinessAlert[] {
  const drafts = [
    ...(figures.commercial ? commercialAlerts(figures.commercial) : []),
    ...(figures.purchasing ? purchasingAlerts(figures.purchasing) : []),
    ...(figures.inventory ? inventoryAlerts(figures.inventory) : []),
  ];
  return drafts
    .filter((draft) => draft.count > 0)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map(({ id, severity, title, description, path }) => ({
      id,
      severity,
      title,
      description,
      path,
    }));
}
