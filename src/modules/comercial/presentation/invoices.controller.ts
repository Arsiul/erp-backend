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
import { type InvoiceInput, InvoicesUseCases } from '../application/invoices.use-cases';
import type { InvoiceRecord } from '../domain/commercial';
import { InvoiceBodyDto } from './dto/commercial-body.dto';
import { InvoiceQueryDto } from './dto/commercial-query.dto';

const invoiceFields = (body: InvoiceBodyDto): InvoiceInput => ({
  saleId: body.saleId,
  kind: body.kind,
  issuedAt: body.issuedAt,
});

@ApiTags('comercial')
@ApiBearerAuth()
@Controller('comprobantes')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesUseCases) {}

  @Get()
  @RequirePermission('comprobantes', 'read')
  @ApiOperation({ summary: 'Comprobantes (facturas y boletas) con filtros' })
  async list(
    @Query() query: InvoiceQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly InvoiceRecord[]> {
    return listBody(res, await this.invoices.list(query));
  }

  @Get(':id')
  @RequirePermission('comprobantes', 'read')
  @ApiOperation({ summary: 'Un comprobante' })
  get(@Param('id') id: string): Promise<InvoiceRecord> {
    return this.invoices.get(id);
  }

  @Post()
  @RequirePermission('comprobantes', 'write')
  @ApiOperation({ summary: 'Emite el comprobante de una venta y abre su cuenta por cobrar' })
  create(
    @Body() body: InvoiceBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvoiceRecord> {
    return this.invoices.create(invoiceFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('comprobantes', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('comprobantes', 'write')
  @ApiOperation({ summary: 'No permitido (405): los comprobantes se anulan' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('comprobantes', 'write')
  @ApiOperation({ summary: 'Acción sobre el comprobante (cancel)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvoiceRecord> {
    return this.invoices.runAction(id, action, user);
  }
}
