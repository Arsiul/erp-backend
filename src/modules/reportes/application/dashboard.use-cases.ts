import { Inject, Injectable } from '@nestjs/common';
import { todayOf } from '../../../shared/application/clock/today';
import { hasAccess, type Permissions } from '../../../shared/domain/authorization/access-level';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { buildSummary, type DashboardData, type DashboardSummary } from '../domain/dashboard';
import {
  comparisonPeriods,
  type DayRange,
  lastSixMonths,
  lastThirtyDays,
  sixMonthsRange,
} from '../domain/periods';
import {
  type ComparisonInput,
  DASHBOARD_QUERIES,
  type DashboardQueries,
} from '../domain/ports/reportes.ports';

/** Latest sales listed on the dashboard. */
export const RECENT_SALES = 6;

/** Best-selling products listed on the dashboard. */
export const TOP_PRODUCTS = 5;

type Commercial = NonNullable<DashboardData['commercial']>;
type Purchasing = NonNullable<DashboardData['purchasing']>;

@Injectable()
export class DashboardUseCases {
  constructor(
    @Inject(DASHBOARD_QUERIES) private readonly queries: DashboardQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The dashboard of the modules the role can read; the others stay out of the queries. */
  async summary(permissions: Permissions): Promise<DashboardSummary> {
    const today = todayOf(this.clock);
    const months = lastSixMonths(today);
    const chartRange = sixMonthsRange(today);
    const comparison: ComparisonInput = { today, ...comparisonPeriods(today) };
    const thirtyDays = lastThirtyDays(today);
    const reads = (module: 'comercial' | 'compras' | 'inventario'): boolean =>
      hasAccess(permissions, module, 'read');

    const [commercial, purchasing, inventory] = await Promise.all([
      reads('comercial') ? this.commercial(comparison, chartRange, thirtyDays) : undefined,
      reads('compras') ? this.purchasing(comparison, chartRange) : undefined,
      reads('inventario') ? this.queries.inventoryFigures(thirtyDays) : undefined,
    ]);

    return buildSummary({
      today,
      months,
      ...(commercial ? { commercial } : {}),
      ...(purchasing ? { purchasing } : {}),
      ...(inventory ? { inventory } : {}),
    });
  }

  private async commercial(
    comparison: ComparisonInput,
    chartRange: DayRange,
    thirtyDays: DayRange,
  ): Promise<Commercial> {
    const [figures, monthlySales, recentSales, topProducts] = await Promise.all([
      this.queries.commercialFigures(comparison),
      this.queries.monthlySales(chartRange),
      this.queries.recentSales(RECENT_SALES),
      this.queries.topProducts(thirtyDays, TOP_PRODUCTS),
    ]);
    return { figures, monthlySales, recentSales, topProducts };
  }

  private async purchasing(comparison: ComparisonInput, chartRange: DayRange): Promise<Purchasing> {
    const [figures, monthlyPurchases] = await Promise.all([
      this.queries.purchasingFigures(comparison),
      this.queries.monthlyPurchases(chartRange),
    ]);
    return { figures, monthlyPurchases };
  }
}
