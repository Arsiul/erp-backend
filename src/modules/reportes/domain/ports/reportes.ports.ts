import type {
  CommercialAlertFigures,
  InventoryAlertFigures,
  PurchasingAlertFigures,
} from '../alerts';
import type {
  CommercialFigures,
  InventoryFigures,
  PurchasingFigures,
  RecentSale,
  TopProduct,
} from '../dashboard';
import type { DayRange } from '../periods';
import type { BalanceData, BalanceSide, DocumentData, FilterOption, StockData } from '../reports';

export const DASHBOARD_QUERIES = Symbol('DashboardQueries');
export const ALERT_QUERIES = Symbol('AlertQueries');
export const REPORT_QUERIES = Symbol('ReportQueries');
export const REPORT_PARTIES = Symbol('ReportParties');

export interface ComparisonInput {
  readonly today: string;
  readonly current: DayRange;
  readonly previous: DayRange;
}

/** Every method is a handful of SQL aggregations; none loads whole tables. */
export interface DashboardQueries {
  commercialFigures(input: ComparisonInput): Promise<CommercialFigures>;
  purchasingFigures(input: ComparisonInput): Promise<PurchasingFigures>;
  /** `costRange`: the days whose cost of sales feeds the inventory turnover. */
  inventoryFigures(costRange: DayRange): Promise<InventoryFigures>;
  /** Σ subtotal of the non-cancelled sales per month (`YYYY-MM`). */
  monthlySales(range: DayRange): Promise<ReadonlyMap<string, number>>;
  /** Σ subtotal of the non-cancelled supplier invoices per month (`YYYY-MM`). */
  monthlyPurchases(range: DayRange): Promise<ReadonlyMap<string, number>>;
  /** Latest sales, any status, newest first. */
  recentSales(limit: number): Promise<RecentSale[]>;
  /** Best-selling products of the non-cancelled sales of the range, by revenue. */
  topProducts(range: DayRange, limit: number): Promise<TopProduct[]>;
}

export interface AlertQueries {
  commercial(today: string): Promise<CommercialAlertFigures>;
  purchasing(today: string): Promise<PurchasingAlertFigures>;
  inventory(): Promise<InventoryAlertFigures>;
}

export interface DocumentCriteria {
  readonly from?: string;
  readonly to?: string;
  /** Customer or supplier id. */
  readonly partyId?: string;
  /** Rows to read at most; the use case asks one more than it allows to detect the overflow. */
  readonly limit: number;
}

export interface StockCriteria {
  readonly warehouseId?: string;
  readonly limit: number;
}

export interface BalanceCriteria {
  readonly from?: string;
  readonly to?: string;
  readonly side?: BalanceSide;
  readonly today: string;
  readonly limit: number;
}

export interface ReportQueries {
  sales(criteria: DocumentCriteria): Promise<DocumentData>;
  purchases(criteria: DocumentCriteria): Promise<DocumentData>;
  inventory(criteria: StockCriteria): Promise<StockData>;
  balances(criteria: BalanceCriteria): Promise<BalanceData>;
}

export type PartyKind = 'customer' | 'supplier' | 'warehouse';

export interface ReportParties {
  exists(kind: PartyKind, id: string): Promise<boolean>;
  options(kind: PartyKind): Promise<FilterOption[]>;
}
