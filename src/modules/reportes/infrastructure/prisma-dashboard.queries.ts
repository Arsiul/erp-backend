import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  CommercialFigures,
  InventoryFigures,
  PurchasingFigures,
  RecentSale,
  TopProduct,
} from '../domain/dashboard';
import type { DayRange } from '../domain/periods';
import type { ComparisonInput, DashboardQueries } from '../domain/ports/reportes.ports';

/** Kardex origins whose cost is the cost of sales (sales, their cancellations and credit notes). */
const COST_OF_SALES_ORIGINS = Prisma.sql`origin IN ('sale', 'sale_cancel', 'credit_note')`;

interface MonthRow {
  readonly month: string;
  readonly amount: number;
}

@Injectable()
export class PrismaDashboardQueries implements DashboardQueries {
  constructor(private readonly host: PrismaTransactionHost) {}

  async commercialFigures({
    today,
    current,
    previous,
  }: ComparisonInput): Promise<CommercialFigures> {
    const [row] = await this.host.client.$queryRaw<CommercialFigures[]>(Prisma.sql`
      SELECT
        (SELECT COALESCE(SUM(subtotal), 0)::float8 FROM sales
          WHERE status <> 'cancelled' AND issued_at BETWEEN ${current.from}::date AND ${current.to}::date
        ) AS "sales",
        (SELECT COALESCE(SUM(subtotal), 0)::float8 FROM sales
          WHERE status <> 'cancelled' AND issued_at BETWEEN ${previous.from}::date AND ${previous.to}::date
        ) AS "previousSales",
        (SELECT COALESCE(SUM(-quantity * unit_cost), 0)::float8 FROM kardex_entries
          WHERE ${COST_OF_SALES_ORIGINS} AND date BETWEEN ${current.from}::date AND ${current.to}::date
        ) AS "costOfSales",
        (SELECT COALESCE(SUM(-quantity * unit_cost), 0)::float8 FROM kardex_entries
          WHERE ${COST_OF_SALES_ORIGINS} AND date BETWEEN ${previous.from}::date AND ${previous.to}::date
        ) AS "previousCostOfSales",
        (SELECT COALESCE(SUM(balance), 0)::float8 FROM receivables
          WHERE balance > 0 AND status <> 'cancelled'
        ) AS "receivableBalance",
        (SELECT COUNT(*)::int FROM receivables
          WHERE balance > 0 AND status <> 'cancelled' AND due_at < ${today}::date
        ) AS "overdueReceivables"
    `);
    return {
      sales: row?.sales ?? 0,
      previousSales: row?.previousSales ?? 0,
      costOfSales: row?.costOfSales ?? 0,
      previousCostOfSales: row?.previousCostOfSales ?? 0,
      receivableBalance: row?.receivableBalance ?? 0,
      overdueReceivables: row?.overdueReceivables ?? 0,
    };
  }

  async purchasingFigures({
    today,
    current,
    previous,
  }: ComparisonInput): Promise<PurchasingFigures> {
    const [row] = await this.host.client.$queryRaw<PurchasingFigures[]>(Prisma.sql`
      SELECT
        (SELECT COALESCE(SUM(balance), 0)::float8 FROM payables
          WHERE balance > 0 AND status <> 'cancelled'
        ) AS "payableBalance",
        (SELECT COUNT(*)::int FROM payables
          WHERE balance > 0 AND status <> 'cancelled' AND due_at < ${today}::date
        ) AS "overduePayables",
        (SELECT COALESCE(SUM(subtotal), 0)::float8 FROM supplier_invoices
          WHERE status <> 'cancelled' AND issued_at BETWEEN ${current.from}::date AND ${current.to}::date
        ) AS "purchases",
        (SELECT COALESCE(SUM(subtotal), 0)::float8 FROM supplier_invoices
          WHERE status <> 'cancelled' AND issued_at BETWEEN ${previous.from}::date AND ${previous.to}::date
        ) AS "previousPurchases"
    `);
    return {
      payableBalance: row?.payableBalance ?? 0,
      overduePayables: row?.overduePayables ?? 0,
      purchases: row?.purchases ?? 0,
      previousPurchases: row?.previousPurchases ?? 0,
    };
  }

  async inventoryFigures(costRange: DayRange): Promise<InventoryFigures> {
    const [row] = await this.host.client.$queryRaw<InventoryFigures[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM stock_items WHERE quantity < min_stock) AS "criticalItems",
        (SELECT COALESCE(SUM(quantity * unit_cost), 0)::float8 FROM stock_items) AS "inventoryValue",
        (SELECT COALESCE(SUM(-quantity * unit_cost), 0)::float8 FROM kardex_entries
          WHERE ${COST_OF_SALES_ORIGINS} AND date BETWEEN ${costRange.from}::date AND ${costRange.to}::date
        ) AS "lastMonthCostOfSales"
    `);
    return {
      criticalItems: row?.criticalItems ?? 0,
      inventoryValue: row?.inventoryValue ?? 0,
      lastMonthCostOfSales: row?.lastMonthCostOfSales ?? 0,
    };
  }

  async monthlySales(range: DayRange): Promise<ReadonlyMap<string, number>> {
    const rows = await this.host.client.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT to_char(issued_at, 'YYYY-MM') AS "month", SUM(subtotal)::float8 AS "amount"
      FROM sales
      WHERE status <> 'cancelled' AND issued_at BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY 1
    `);
    return byMonth(rows);
  }

  async monthlyPurchases(range: DayRange): Promise<ReadonlyMap<string, number>> {
    const rows = await this.host.client.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT to_char(issued_at, 'YYYY-MM') AS "month", SUM(subtotal)::float8 AS "amount"
      FROM supplier_invoices
      WHERE status <> 'cancelled' AND issued_at BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY 1
    `);
    return byMonth(rows);
  }

  recentSales(limit: number): Promise<RecentSale[]> {
    return this.host.client.$queryRaw<RecentSale[]>(Prisma.sql`
      SELECT id, number, customer_name AS "customerName",
        to_char(issued_at, 'YYYY-MM-DD') AS "issuedAt", total::float8 AS "total",
        status::text AS "status", invoice_number AS "invoiceNumber"
      FROM sales
      ORDER BY issued_at DESC, seq DESC
      LIMIT ${limit}
    `);
  }

  topProducts(range: DayRange, limit: number): Promise<TopProduct[]> {
    return this.host.client.$queryRaw<TopProduct[]>(Prisma.sql`
      SELECT l.product_id AS "id",
        COALESCE(MAX(p.name), MAX(l.product_name)) AS "name",
        COALESCE(MAX(c.name), '') AS "category",
        SUM(l.quantity)::int AS "units",
        SUM(l.quantity * l.unit_price)::float8 AS "revenue"
      FROM sale_lines l
      JOIN sales s ON s.id = l.sale_id
      LEFT JOIN products p ON p.id = l.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.status <> 'cancelled' AND s.issued_at BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY l.product_id
      ORDER BY "revenue" DESC, "name" ASC
      LIMIT ${limit}
    `);
  }
}

function byMonth(rows: readonly MonthRow[]): ReadonlyMap<string, number> {
  return new Map(rows.map((row) => [row.month, row.amount]));
}
