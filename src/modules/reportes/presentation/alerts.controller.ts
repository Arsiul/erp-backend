import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { AlertsUseCases } from '../application/alerts.use-cases';
import type { BusinessAlert } from '../domain/alerts';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsUseCases) {}

  @Get()
  @RequirePermission('reportes', 'read')
  @ApiOperation({ summary: 'Alertas de negocio de los módulos que el rol puede leer' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<BusinessAlert[]> {
    return this.alerts.list(user.permissions);
  }
}
