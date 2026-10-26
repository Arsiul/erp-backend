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
import { type SaleInput, SalesUseCases } from '../application/sales.use-cases';
import type { SaleRecord } from '../domain/commercial';
import { SaleBodyDto } from './dto/commercial-body.dto';
import { SaleQueryDto } from './dto/commercial-query.dto';

const saleFields = (body: SaleBodyDto): SaleInput => ({
  quoteId: body.quoteId,
  customerId: body.customerId,
  warehouseId: body.warehouseId,
  issuedAt: body.issuedAt,
  seller: body.seller,
  paymentTerm: body.paymentTerm,
  lines: body.lines,
  notes: body.notes,
});

@ApiTags('comercial')
@ApiBearerAuth()
@Controller('ventas')
export class SalesController {
  constructor(private readonly sales: SalesUseCases) {}

  @Get()
  @RequirePermission('ventas', 'read')
  @ApiOperation({ summary: 'Ventas con filtros' })
  async list(
    @Query() query: SaleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly SaleRecord[]> {
    return listBody(res, await this.sales.list(query));
  }

  @Get(':id')
  @RequirePermission('ventas', 'read')
  @ApiOperation({ summary: 'Una venta' })
  get(@Param('id') id: string): Promise<SaleRecord> {
    return this.sales.get(id);
  }

  @Post()
  @RequirePermission('ventas', 'write')
  @ApiOperation({ summary: 'Registra una venta y descuenta el stock' })
  create(@Body() body: SaleBodyDto, @CurrentUser() user: AuthenticatedUser): Promise<SaleRecord> {
    return this.sales.create(saleFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('ventas', 'write')
  @ApiOperation({ summary: 'Edita vendedor, condición de pago y notas de una venta' })
  update(
    @Param('id') id: string,
    @Body() body: SaleBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaleRecord> {
    return this.sales.update(id, saleFields(body), user);
  }

  @Delete(':id')
  @RequirePermission('ventas', 'write')
  @ApiOperation({ summary: 'No permitido (405): las ventas se anulan' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas', 'write')
  @ApiOperation({ summary: 'Acción sobre la venta (cancel)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaleRecord> {
    return this.sales.runAction(id, action, user);
  }
}
