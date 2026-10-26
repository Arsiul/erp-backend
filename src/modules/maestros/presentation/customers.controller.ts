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
import { CustomersUseCases } from '../application/customers.use-cases';
import type { CustomerInput, CustomerRecord } from '../domain/customer';
import { CustomerBodyDto } from './dto/master-body.dto';
import { CustomerQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: CustomerBodyDto): CustomerInput => ({
  name: body.name,
  documentType: body.documentType,
  documentNumber: body.documentNumber,
  email: body.email,
  phone: body.phone,
  address: body.address,
  creditDays: body.creditDays,
  creditLimit: body.creditLimit,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('clientes')
export class CustomersController {
  constructor(private readonly customers: CustomersUseCases) {}

  @Get()
  @RequirePermission('clientes', 'read')
  @ApiOperation({ summary: 'Lista de clientes' })
  async list(
    @Query() query: CustomerQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly CustomerRecord[]> {
    return listBody(res, await this.customers.list(query));
  }

  @Get(':id')
  @RequirePermission('clientes', 'read')
  @ApiOperation({ summary: 'Un cliente' })
  get(@Param('id') id: string): Promise<CustomerRecord> {
    return this.customers.get(id);
  }

  @Post()
  @RequirePermission('clientes', 'write')
  @ApiOperation({ summary: 'Crea un cliente; el código CLI-0001 lo asigna el servidor' })
  create(
    @Body() body: CustomerBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerRecord> {
    return this.customers.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('clientes', 'write')
  @ApiOperation({ summary: 'Edita un cliente (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: CustomerBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerRecord> {
    return this.customers.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('clientes', 'write')
  @ApiOperation({ summary: 'Elimina un cliente sin cotizaciones, ventas ni cuentas por cobrar' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.customers.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('clientes', 'write')
  @ApiOperation({ summary: 'Acción sobre el cliente (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerRecord> {
    return this.customers.runAction(id, action, user);
  }
}
