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
import { SuppliersUseCases } from '../application/suppliers.use-cases';
import type { SupplierInput, SupplierRecord } from '../domain/supplier';
import { SupplierBodyDto } from './dto/master-body.dto';
import { MasterQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: SupplierBodyDto): SupplierInput => ({
  name: body.name,
  ruc: body.ruc,
  contactName: body.contactName,
  email: body.email,
  phone: body.phone,
  address: body.address,
  paymentDays: body.paymentDays,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('proveedores')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersUseCases) {}

  @Get()
  @RequirePermission('proveedores', 'read')
  @ApiOperation({ summary: 'Lista de proveedores' })
  async list(
    @Query() query: MasterQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly SupplierRecord[]> {
    return listBody(res, await this.suppliers.list(query));
  }

  @Get(':id')
  @RequirePermission('proveedores', 'read')
  @ApiOperation({ summary: 'Un proveedor' })
  get(@Param('id') id: string): Promise<SupplierRecord> {
    return this.suppliers.get(id);
  }

  @Post()
  @RequirePermission('proveedores', 'write')
  @ApiOperation({ summary: 'Crea un proveedor; el código PRV-0001 lo asigna el servidor' })
  create(
    @Body() body: SupplierBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierRecord> {
    return this.suppliers.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('proveedores', 'write')
  @ApiOperation({ summary: 'Edita un proveedor (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: SupplierBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierRecord> {
    return this.suppliers.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('proveedores', 'write')
  @ApiOperation({
    summary: 'Elimina un proveedor sin órdenes, recepciones, facturas ni cuentas por pagar',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.suppliers.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('proveedores', 'write')
  @ApiOperation({ summary: 'Acción sobre el proveedor (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierRecord> {
    return this.suppliers.runAction(id, action, user);
  }
}
