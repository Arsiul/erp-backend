import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { DashboardUseCases } from '../application/dashboard.use-cases';
import type { DashboardSummary } from '../domain/dashboard';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardUseCases) {}

  @Get('summary')
  @RequirePermission('reportes', 'read')
  @ApiOperation({ summary: 'Indicadores del tablero según los módulos del rol' })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardSummary> {
    return this.dashboard.summary(user.permissions);
  }
}
