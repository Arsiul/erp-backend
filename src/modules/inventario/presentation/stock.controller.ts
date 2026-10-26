import { Body, Controller, Get, Param, Patch, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { StockUseCases } from '../application/stock.use-cases';
import type { StockView } from '../domain/inventory';
import { UpdateStockDto } from './dto/inventory-body.dto';
import { StockQueryDto } from './dto/inventory-query.dto';

@ApiTags('inventario')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockUseCases) {}

  @Get()
  @RequirePermission('stock', 'read')
  @ApiOperation({ summary: 'Stock por producto y almacén' })
  async list(
    @Query() query: StockQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly StockView[]> {
    return listBody(res, await this.stock.list(query));
  }

  @Get(':id')
  @RequirePermission('stock', 'read')
  @ApiOperation({ summary: 'Una posición de stock' })
  get(@Param('id') id: string): Promise<StockView> {
    return this.stock.get(id);
  }

  @Patch(':id')
  @RequirePermission('stock', 'write')
  @ApiOperation({ summary: 'Edita el stock mínimo (la cantidad solo cambia por movimientos)' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockView> {
    return this.stock.update(id, { minStock: body.minStock }, user);
  }
}
