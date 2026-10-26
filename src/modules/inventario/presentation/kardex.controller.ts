import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { KardexQueries } from '../application/kardex.queries';
import type { KardexView } from '../domain/inventory';
import { KardexQueryDto } from './dto/inventory-query.dto';

@ApiTags('inventario')
@ApiBearerAuth()
@Controller('kardex')
export class KardexController {
  constructor(private readonly kardex: KardexQueries) {}

  @Get()
  @RequirePermission('kardex', 'read')
  @ApiOperation({ summary: 'Movimientos de stock (solo lectura)' })
  async list(
    @Query() query: KardexQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly KardexView[]> {
    return listBody(res, await this.kardex.list(query));
  }

  @Get(':id')
  @RequirePermission('kardex', 'read')
  @ApiOperation({ summary: 'Un movimiento del kardex' })
  get(@Param('id') id: string): Promise<KardexView> {
    return this.kardex.get(id);
  }
}
