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
import { listBody } from '../../../shared/presentation/listing/list-response';
import { WarehousesUseCases } from '../application/warehouses.use-cases';
import type { WarehouseInput, WarehouseRecord } from '../domain/warehouse';
import { WarehouseBodyDto } from './dto/master-body.dto';
import { MasterQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: WarehouseBodyDto): WarehouseInput => ({
  name: body.name,
  address: body.address,
  manager: body.manager,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('almacenes')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesUseCases) {}

  @Get()
  @RequirePermission('almacenes', 'read')
  @ApiOperation({ summary: 'Lista de almacenes' })
  async list(
    @Query() query: MasterQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly WarehouseRecord[]> {
    return listBody(res, await this.warehouses.list(query));
  }

  @Get(':id')
  @RequirePermission('almacenes', 'read')
  @ApiOperation({ summary: 'Un almacén' })
  get(@Param('id') id: string): Promise<WarehouseRecord> {
    return this.warehouses.get(id);
  }

  @Post()
  @RequirePermission('almacenes', 'write')
  @ApiOperation({ summary: 'Crea un almacén con stock en cero para cada producto' })
  create(
    @Body() body: WarehouseBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WarehouseRecord> {
    return this.warehouses.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('almacenes', 'write')
  @ApiOperation({ summary: 'Edita un almacén (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: WarehouseBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WarehouseRecord> {
    return this.warehouses.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('almacenes', 'write')
  @ApiOperation({ summary: 'Elimina un almacén sin movimientos' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.warehouses.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('almacenes', 'write')
  @ApiOperation({ summary: 'Acción sobre el almacén (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WarehouseRecord> {
    return this.warehouses.runAction(id, action, user);
  }
}
