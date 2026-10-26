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
import { PurchaseOrdersUseCases } from '../application/purchase-orders.use-cases';
import type { PurchaseOrderView } from '../domain/purchase-order';
import type { PurchaseOrderInput } from '../domain/purchase-order-rules';
import { PurchaseOrderDto } from './dto/compras-body.dto';
import { PurchaseOrderQueryDto } from './dto/compras-query.dto';

/** Only the editable fields reach the use case; numbers, names and totals are recomputed. */
const orderFields = (body: PurchaseOrderDto): PurchaseOrderInput => ({
  supplierId: body.supplierId,
  warehouseId: body.warehouseId,
  issuedAt: body.issuedAt,
  expectedAt: body.expectedAt,
  lines: body.lines,
  notes: body.notes,
});

@ApiTags('compras')
@ApiBearerAuth()
@Controller('ordenes-compra')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersUseCases) {}

  @Get()
  @RequirePermission('ordenes-compra', 'read')
  @ApiOperation({ summary: 'Órdenes de compra (filtros: estado, proveedor, almacén, emisión)' })
  async list(
    @Query() query: PurchaseOrderQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly PurchaseOrderView[]> {
    return listBody(res, await this.orders.list(query));
  }

  @Get(':id')
  @RequirePermission('ordenes-compra', 'read')
  @ApiOperation({ summary: 'Una orden de compra con lo recibido por línea' })
  get(@Param('id') id: string): Promise<PurchaseOrderView> {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermission('ordenes-compra', 'write')
  @ApiOperation({ summary: 'Registra una orden de compra en borrador (OC-00001)' })
  create(
    @Body() body: PurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseOrderView> {
    return this.orders.create(orderFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('ordenes-compra', 'write')
  @ApiOperation({ summary: 'Edita una orden en borrador (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: PurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseOrderView> {
    return this.orders.update(id, orderFields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ordenes-compra', 'write')
  @ApiOperation({ summary: 'Elimina una orden en borrador' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.orders.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ordenes-compra', 'write')
  @ApiOperation({ summary: 'approve (borrador) o cancel (borrador o aprobada sin recepciones)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseOrderView> {
    return this.orders.runAction(id, action, user);
  }
}
