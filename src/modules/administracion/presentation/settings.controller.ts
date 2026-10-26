import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import {
  AllowAuthenticated,
  CurrentUser,
  RequirePermission,
} from '../../../shared/presentation/auth/auth.decorators';
import { SettingsUseCases } from '../application/settings.use-cases';
import type { Settings } from '../domain/settings';
import { SettingsDto } from './dto/admin-body.dto';

@ApiTags('administracion')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsUseCases) {}

  @Get()
  @AllowAuthenticated()
  @ApiOperation({ summary: 'Configuración de la empresa (cualquier usuario autenticado)' })
  get(): Promise<Settings> {
    return this.settings.get();
  }

  @Put()
  @RequirePermission('administracion', 'write')
  @ApiOperation({ summary: 'Guarda la configuración (audita "Actualizó" en configuracion)' })
  save(@Body() body: SettingsDto, @CurrentUser() user: AuthenticatedUser): Promise<Settings> {
    return this.settings.save(body, user);
  }
}
