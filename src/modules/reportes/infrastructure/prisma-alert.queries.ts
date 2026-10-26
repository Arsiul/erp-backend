import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { addDays } from '../../../shared/domain/time/lima-time';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  CommercialAlertFigures,
  InventoryAlertFigures,
  PurchasingAlertFigures,
} from '../domain/alerts';
import type { AlertQueries } from '../domain/ports/reportes.ports';

/** Quotes sent that expire within this many days (or already expired) need follow-up. */
const QUOTE_HORIZON_DAYS = 2;
/** Open payables due within this many days. */
const PAYABLE_HORIZON_DAYS = 7;

@Injectable()
export class PrismaAlertQueries implements AlertQueries {
  constructor(private readonly host: PrismaTransactionHost) {}

  async commercial(today: string): Promise<CommercialAlertFigures> {
    const quoteLimit = addDays(today, QUOTE_HORIZON_DAYS);
    const [row] = await this.host.client.$queryRaw<CommercialAlertFigures[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM receivables
          WHERE balance > 0 AND status <> 'cancelled' AND due_at < ${today}::date
        ) AS "overdueReceivables",
        (SELECT COALESCE(SUM(balance), 0)::float8 FROM receivables
          WHERE balance > 0 AND status <> 'cancelled' AND due_at < ${today}::date
        ) AS "overdueReceivableBalance",
        (SELECT COUNT(*)::int FROM sales WHERE status = 'pending_invoice') AS "salesToInvoice",
        (SELECT COUNT(*)::int FROM quotes
          WHERE status = 'sent' AND valid_until <= ${quoteLimit}::date
        ) AS "expiringQuotes"
    `);
    return {
      overdueReceivables: row?.overdueReceivables ?? 0,
      overdueReceivableBalance: row?.overdueReceivableBalance ?? 0,
      salesToInvoice: row?.salesToInvoice ?? 0,
      expiringQuotes: row?.expiringQuotes ?? 0,
    };
  }

  async purchasing(today: string): Promise<PurchasingAlertFigures> {
    const dueLimit = addDays(today, PAYABLE_HORIZON_DAYS);
    const [row] = await this.host.client.$queryRaw<PurchasingAlertFigures[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE p.due_at < ${today}::date)::int AS "overduePayables",
        COALESCE(SUM(p.balance) FILTER (WHERE p.due_at < ${today}::date), 0)::float8
          AS "overduePayableBalance",
        COUNT(*) FILTER (WHERE p.due_at >= ${today}::date AND p.due_at <= ${dueLimit}::date)::int
          AS "payablesDueSoon",
        COALESCE(
          SUM(p.balance) FILTER (WHERE p.due_at >= ${today}::date AND p.due_at <= ${dueLimit}::date),
          0
        )::float8 AS "payablesDueSoonBalance",
        (SELECT COUNT(*)::int FROM receipts WHERE status = 'pending_bill') AS "receiptsToBill"
      FROM payables p
      WHERE p.balance > 0 AND p.status <> 'cancelled'
    `);
    return {
      overduePayables: row?.overduePayables ?? 0,
      overduePayableBalance: row?.overduePayableBalance ?? 0,
      payablesDueSoon: row?.payablesDueSoon ?? 0,
      payablesDueSoonBalance: row?.payablesDueSoonBalance ?? 0,
      receiptsToBill: row?.receiptsToBill ?? 0,
    };
  }

  async inventory(): Promise<InventoryAlertFigures> {
    const [row] = await this.host.client.$queryRaw<InventoryAlertFigures[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE s.quantity < s.min_stock)::int AS "criticalItems",
        COUNT(*) FILTER (WHERE s.quantity < s.min_stock AND s.quantity = 0)::int AS "emptyItems",
        (SELECT COUNT(*)::int FROM transfers WHERE status = 'pending') AS "pendingTransfers"
      FROM stock_items s
    `);
    return {
      criticalItems: row?.criticalItems ?? 0,
      emptyItems: row?.emptyItems ?? 0,
      pendingTransfers: row?.pendingTransfers ?? 0,
    };
  }
}
