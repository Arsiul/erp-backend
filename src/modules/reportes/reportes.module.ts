import { Module } from '@nestjs/common';
import { AlertsUseCases } from './application/alerts.use-cases';
import { DashboardUseCases } from './application/dashboard.use-cases';
import { ReportsUseCases } from './application/reports.use-cases';
import {
  ALERT_QUERIES,
  DASHBOARD_QUERIES,
  REPORT_PARTIES,
  REPORT_QUERIES,
} from './domain/ports/reportes.ports';
import { PrismaAlertQueries } from './infrastructure/prisma-alert.queries';
import { PrismaDashboardQueries } from './infrastructure/prisma-dashboard.queries';
import { PrismaReportParties } from './infrastructure/prisma-report-parties';
import { PrismaReportQueries } from './infrastructure/prisma-report.queries';
import { AlertsController } from './presentation/alerts.controller';
import { DashboardController } from './presentation/dashboard.controller';
import { ReportsController } from './presentation/reports.controller';

/**
 * Read-only dashboard, alerts and reports. Every figure is aggregated in SQL; the dashboard and
 * the alerts only query the modules the role can read.
 */
@Module({
  controllers: [DashboardController, AlertsController, ReportsController],
  providers: [
    { provide: DASHBOARD_QUERIES, useClass: PrismaDashboardQueries },
    { provide: ALERT_QUERIES, useClass: PrismaAlertQueries },
    { provide: REPORT_QUERIES, useClass: PrismaReportQueries },
    { provide: REPORT_PARTIES, useClass: PrismaReportParties },
    DashboardUseCases,
    AlertsUseCases,
    ReportsUseCases,
  ],
})
export class ReportesModule {}
