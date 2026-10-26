import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  BalanceCriteria,
  DocumentCriteria,
  ReportQueries,
  StockCriteria,
} from '../domain/ports/reportes.ports';
import {
  type BalanceData,
  type BalanceRow,
  type BalanceTotals,
  CHART_LIMIT,
  type ChartPoint,
  type DocumentData,
  type DocumentRow,
  type DocumentTotals,
  type StockData,
  type StockRow,
  type StockTotals,
} from '../domain/reports';
import { dayBounds, equalsFilter } from '../../../shared/infrastructure/prisma/sql-fragments';

interface BucketRow {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly b3: number;
  readonly b4: number;
}

const EMPTY_DOCUMENT_TOTALS: DocumentTotals = { count: 0, subtotal: 0, total: 0 };
const EMPTY_STOCK_TOTALS: StockTotals = { items: 0, units: 0, value: 0, low: 0 };
const EMPTY_BALANCE_TOTALS: BalanceTotals = {
  receivable: 0,
  receivableOverdue: 0,
  payable: 0,
  payableOverdue: 0,
};

/**
 * Each report reads its rows, its totals and its chart with separate SQL statements;
 * the totals never come from summing the rows in memory.
 */
@Injectable()
export class PrismaReportQueries implements ReportQueries {
  constructor(private readonly host: PrismaTransactionHost) {}

  async sales(criteria: DocumentCriteria): Promise<DocumentData> {
    const where = Prisma.sql`
      WHERE status <> 'cancelled'
      ${dayBounds(Prisma.sql`issued_at`, criteria.from, criteria.to)}
      ${equalsFilter(Prisma.sql`customer_id`, criteria.partyId)}`;
    const db = this.host.client;
    const [rows, [totals], chart] = await Promise.all([
      db.$queryRaw<DocumentRow[]>(Prisma.sql`
        SELECT number, to_char(issued_at, 'YYYY-MM-DD') AS "issuedAt", customer_name AS "party",
          status::text AS "reference", subtotal::float8 AS "subtotal", igv::float8 AS "igv",
          total::float8 AS "total"
        FROM sales ${where}
        ORDER BY issued_at DESC, seq DESC
        LIMIT ${criteria.limit}`),
      db.$queryRaw<DocumentTotals[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "count", COALESCE(SUM(subtotal), 0)::float8 AS "subtotal",
          COALESCE(SUM(total), 0)::float8 AS "total"
        FROM sales ${where}`),
      db.$queryRaw<ChartPoint[]>(Prisma.sql`
        SELECT customer_name AS "label", SUM(total)::float8 AS "value"
        FROM sales ${where}
        GROUP BY customer_name
        ORDER BY "value" DESC, "label" ASC
        LIMIT ${CHART_LIMIT}`),
    ]);
    return { rows, totals: totals ?? EMPTY_DOCUMENT_TOTALS, chart };
  }

  async purchases(criteria: DocumentCriteria): Promise<DocumentData> {
    const where = Prisma.sql`
      WHERE status <> 'cancelled'
      ${dayBounds(Prisma.sql`issued_at`, criteria.from, criteria.to)}
      ${equalsFilter(Prisma.sql`supplier_id`, criteria.partyId)}`;
    const db = this.host.client;
    const [rows, [totals], chart] = await Promise.all([
      db.$queryRaw<DocumentRow[]>(Prisma.sql`
        SELECT document_number AS "number", to_char(issued_at, 'YYYY-MM-DD') AS "issuedAt",
          supplier_name AS "party", receipt_number AS "reference", subtotal::float8 AS "subtotal",
          igv::float8 AS "igv", total::float8 AS "total"
        FROM supplier_invoices ${where}
        ORDER BY issued_at DESC, seq DESC
        LIMIT ${criteria.limit}`),
      db.$queryRaw<DocumentTotals[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "count", COALESCE(SUM(subtotal), 0)::float8 AS "subtotal",
          COALESCE(SUM(total), 0)::float8 AS "total"
        FROM supplier_invoices ${where}`),
      db.$queryRaw<ChartPoint[]>(Prisma.sql`
        SELECT supplier_name AS "label", SUM(total)::float8 AS "value"
        FROM supplier_invoices ${where}
        GROUP BY supplier_name
        ORDER BY "value" DESC, "label" ASC
        LIMIT ${CHART_LIMIT}`),
    ]);
    return { rows, totals: totals ?? EMPTY_DOCUMENT_TOTALS, chart };
  }

  async inventory(criteria: StockCriteria): Promise<StockData> {
    const where = Prisma.sql`WHERE TRUE ${equalsFilter(Prisma.sql`s.warehouse_id`, criteria.warehouseId)}`;
    const db = this.host.client;
    const [rows, [totals], chart] = await Promise.all([
      db.$queryRaw<StockRow[]>(Prisma.sql`
        SELECT p.sku, p.name AS "product", c.name AS "category", w.name AS "warehouse",
          s.quantity, s.min_stock AS "minStock", s.unit_cost::float8 AS "unitCost"
        FROM stock_items s
        JOIN products p ON p.id = s.product_id
        JOIN categories c ON c.id = p.category_id
        JOIN warehouses w ON w.id = s.warehouse_id
        ${where}
        ORDER BY p.name ASC, w.name ASC, s.id ASC
        LIMIT ${criteria.limit}`),
      db.$queryRaw<StockTotals[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "items", COALESCE(SUM(s.quantity), 0)::float8 AS "units",
          COALESCE(SUM(s.quantity * s.unit_cost), 0)::float8 AS "value",
          COUNT(*) FILTER (WHERE s.quantity < s.min_stock)::int AS "low"
        FROM stock_items s ${where}`),
      db.$queryRaw<ChartPoint[]>(Prisma.sql`
        SELECT c.name AS "label", SUM(s.quantity * s.unit_cost)::float8 AS "value"
        FROM stock_items s
        JOIN products p ON p.id = s.product_id
        JOIN categories c ON c.id = p.category_id
        ${where}
        GROUP BY c.name
        ORDER BY "value" DESC, "label" ASC
        LIMIT ${CHART_LIMIT}`),
    ]);
    return { rows, totals: totals ?? EMPTY_STOCK_TOTALS, chart };
  }

  async balances(criteria: BalanceCriteria): Promise<BalanceData> {
    const open = Prisma.sql`
      WITH open_balances AS (
        SELECT 'cobrar'::text AS side, document_number, customer_name AS party, issued_at, due_at, balance
        FROM receivables WHERE balance > 0 AND status <> 'cancelled'
        UNION ALL
        SELECT 'pagar'::text, document_number, supplier_name, issued_at, due_at, balance
        FROM payables WHERE balance > 0 AND status <> 'cancelled'
      ), filtered AS (
        SELECT side, document_number, party, due_at, balance, (${criteria.today}::date - due_at) AS late
        FROM open_balances
        WHERE TRUE
        ${dayBounds(Prisma.sql`issued_at`, criteria.from, criteria.to)}
        ${equalsFilter(Prisma.sql`side`, criteria.side)}
      )`;
    const db = this.host.client;
    const [rows, [totals], [buckets]] = await Promise.all([
      db.$queryRaw<BalanceRow[]>(Prisma.sql`${open}
        SELECT side, document_number AS "documentNumber", party,
          to_char(due_at, 'YYYY-MM-DD') AS "dueAt", balance::float8 AS "balance"
        FROM filtered
        ORDER BY due_at ASC, side ASC, document_number ASC
        LIMIT ${criteria.limit}`),
      db.$queryRaw<BalanceTotals[]>(Prisma.sql`${open}
        SELECT
          COALESCE(SUM(balance) FILTER (WHERE side = 'cobrar'), 0)::float8 AS "receivable",
          COALESCE(SUM(balance) FILTER (WHERE side = 'cobrar' AND late > 0), 0)::float8
            AS "receivableOverdue",
          COALESCE(SUM(balance) FILTER (WHERE side = 'pagar'), 0)::float8 AS "payable",
          COALESCE(SUM(balance) FILTER (WHERE side = 'pagar' AND late > 0), 0)::float8
            AS "payableOverdue"
        FROM filtered`),
      db.$queryRaw<BucketRow[]>(Prisma.sql`${open}
        SELECT
          COALESCE(SUM(balance) FILTER (WHERE late <= 0), 0)::float8 AS "b0",
          COALESCE(SUM(balance) FILTER (WHERE late BETWEEN 1 AND 30), 0)::float8 AS "b1",
          COALESCE(SUM(balance) FILTER (WHERE late BETWEEN 31 AND 60), 0)::float8 AS "b2",
          COALESCE(SUM(balance) FILTER (WHERE late BETWEEN 61 AND 90), 0)::float8 AS "b3",
          COALESCE(SUM(balance) FILTER (WHERE late > 90), 0)::float8 AS "b4"
        FROM filtered`),
    ]);
    return {
      rows,
      totals: totals ?? EMPTY_BALANCE_TOTALS,
      buckets: buckets ? [buckets.b0, buckets.b1, buckets.b2, buckets.b3, buckets.b4] : [],
    };
  }
}
