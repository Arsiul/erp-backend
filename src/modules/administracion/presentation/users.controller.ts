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
import { UsersUseCases } from '../application/users.use-cases';
import type { UserView } from '../domain/user';
import type { UserInput } from '../domain/user-rules';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/admin-body.dto';
import { UserQueryDto } from './dto/list-query.dto';
import { listBody } from '../../../shared/presentation/listing/list-response';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const userFields = (body: UpdateUserDto): UserInput => ({
  name: body.name,
  email: body.email,
  roleId: body.roleId,
  status: body.status,
});

@ApiTags('administracion')
@ApiBearerAuth()
@Controller('usuarios')
export class UsersController {
  constructor(private readonly users: UsersUseCases) {}

  @Get()
  @RequirePermission('usuarios', 'read')
  @ApiOperation({ summary: 'Lista de usuarios (sin hash de contraseña)' })
  async list(
    @Query() query: UserQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly UserView[]> {
    return listBody(res, await this.users.list(query));
  }

  @Get(':id')
  @RequirePermission('usuarios', 'read')
  @ApiOperation({ summary: 'Un usuario' })
  get(@Param('id') id: string): Promise<UserView> {
    return this.users.get(id);
  }

  @Post()
  @RequirePermission('usuarios', 'write')
  @ApiOperation({ summary: 'Crea un usuario con su contraseña inicial' })
  create(@Body() body: CreateUserDto, @CurrentUser() user: AuthenticatedUser): Promise<UserView> {
    return this.users.create({ ...userFields(body), password: body.password }, user);
  }

  @Patch(':id')
  @RequirePermission('usuarios', 'write')
  @ApiOperation({ summary: 'Edita un usuario (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserView> {
    return this.users.update(id, userFields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('usuarios', 'write')
  @ApiOperation({ summary: 'Elimina un usuario sin actividad registrada' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.users.remove(id, user);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('usuarios', 'write')
  @ApiOperation({ summary: 'Reinicia la contraseña, desbloquea y cierra sus sesiones' })
  resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.users.resetPassword(id, { password: body.password }, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('usuarios', 'write')
  @ApiOperation({ summary: 'Acción sobre el usuario (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserView> {
    return this.users.runAction(id, action, user);
  }
}
