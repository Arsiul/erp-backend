import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { ReportsUseCases } from '../application/reports.use-cases';
import type { ReportFilterSpec, ReportResult } from '../domain/reports';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsUseCases) {}

  @Get(':report')
  @RequirePermission('reportes', 'read')
  @ApiOperation({ summary: 'Ejecuta un reporte: ventas, compras, inventario o saldos' })
  run(@Param('report') report: string, @Query() query: ReportQueryDto): Promise<ReportResult> {
    return this.reports.run(report, { from: query.from, to: query.to, party: query.party });
  }

  @Get(':report/filters')
  @RequirePermission('reportes', 'read')
  @ApiOperation({ summary: 'Opciones de filtro de un reporte' })
  filters(@Param('report') report: string): Promise<ReportFilterSpec> {
    return this.reports.filters(report);
  }
}
