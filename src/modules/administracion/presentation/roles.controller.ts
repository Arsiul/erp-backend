import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { RolesUseCases } from '../application/roles.use-cases';
import type { RoleRecord } from '../domain/role';
import type { RoleInput } from '../domain/role-rules';
import { RoleDto } from './dto/admin-body.dto';
import { ListQueryDto } from '../../../shared/presentation/listing/list-query.dto';
import { listBody } from '../../../shared/presentation/listing/list-response';

/** Only the editable fields reach the use case; `id` and `system` sent by the form are dropped. */
const roleFields = (body: RoleDto): RoleInput => ({
  name: body.name,
  description: body.description,
  permissions: body.permissions,
});

@ApiTags('administracion')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesUseCases) {}

  @Get()
  @RequirePermission('roles', 'read')
  @ApiOperation({ summary: 'Lista de roles con su matriz de permisos' })
  async list(
    @Query() query: ListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly RoleRecord[]> {
    return listBody(res, await this.roles.list(query));
  }

  @Get(':id')
  @RequirePermission('roles', 'read')
  @ApiOperation({ summary: 'Un rol' })
  get(@Param('id') id: string): Promise<RoleRecord> {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermission('roles', 'write')
  @ApiOperation({ summary: 'Crea un rol' })
  create(@Body() body: RoleDto, @CurrentUser() user: AuthenticatedUser): Promise<RoleRecord> {
    return this.roles.create(roleFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('roles', 'write')
  @ApiOperation({ summary: 'Edita un rol (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: RoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RoleRecord> {
    return this.roles.update(id, roleFields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('roles', 'write')
  @ApiOperation({ summary: 'Elimina un rol sin usuarios asignados' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.roles.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('roles', 'write')
  @ApiOperation({ summary: 'Acción sobre el rol (los roles no tienen acciones)' })
  runAction(@Param('id') id: string, @Param('action') action: string): Promise<RoleRecord> {
    return this.roles.runAction(id, action);
  }
}
