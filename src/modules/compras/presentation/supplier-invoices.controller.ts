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
import { OperationNotAllowedError } from '../../../shared/domain/errors/domain-error';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { SupplierInvoicesUseCases } from '../application/supplier-invoices.use-cases';
import type { SupplierInvoiceView } from '../domain/supplier-invoice';
import { SupplierInvoiceDto } from './dto/compras-body.dto';
import { SupplierInvoiceQueryDto } from './dto/compras-query.dto';

@ApiTags('compras')
@ApiBearerAuth()
@Controller('facturas-proveedor')
export class SupplierInvoicesController {
  constructor(private readonly invoices: SupplierInvoicesUseCases) {}

  @Get()
  @RequirePermission('facturas-proveedor', 'read')
  @ApiOperation({
    summary: 'Facturas de proveedor (filtros: estado, proveedor, recepción, emisión)',
  })
  async list(
    @Query() query: SupplierInvoiceQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly SupplierInvoiceView[]> {
    return listBody(res, await this.invoices.list(query));
  }

  @Get(':id')
  @RequirePermission('facturas-proveedor', 'read')
  @ApiOperation({ summary: 'Una factura de proveedor' })
  get(@Param('id') id: string): Promise<SupplierInvoiceView> {
    return this.invoices.get(id);
  }

  @Post()
  @RequirePermission('facturas-proveedor', 'write')
  @ApiOperation({
    summary: 'Registra la factura: abre su cuenta por pagar y factura la recepción indicada',
  })
  create(
    @Body() body: SupplierInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.create(
      {
        documentNumber: body.documentNumber,
        supplierId: body.supplierId,
        receiptId: body.receiptId,
        issuedAt: body.issuedAt,
        dueAt: body.dueAt,
        subtotal: body.subtotal,
      },
      user,
    );
  }

  @Patch(':id')
  @RequirePermission('facturas-proveedor', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('facturas-proveedor', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('facturas-proveedor', 'write')
  @ApiOperation({ summary: 'cancel: anula la factura y su cuenta por pagar (sin pagos)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.runAction(id, action, user);
  }
}
