import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { AdjustmentsUseCases } from '../application/adjustments.use-cases';
import type { AdjustmentView } from '../domain/inventory';
import { CreateAdjustmentDto } from './dto/inventory-body.dto';
import { AdjustmentQueryDto } from './dto/inventory-query.dto';

@ApiTags('inventario')
@ApiBearerAuth()
@Controller('ajustes')
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsUseCases) {}

  @Get()
  @RequirePermission('ajustes', 'read')
  @ApiOperation({ summary: 'Ajustes de inventario' })
  async list(
    @Query() query: AdjustmentQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly AdjustmentView[]> {
    return listBody(res, await this.adjustments.list(query));
  }

  @Get(':id')
  @RequirePermission('ajustes', 'read')
  @ApiOperation({ summary: 'Un ajuste' })
  get(@Param('id') id: string): Promise<AdjustmentView> {
    return this.adjustments.get(id);
  }

  @Post()
  @RequirePermission('ajustes', 'write')
  @ApiOperation({ summary: 'Registra un ajuste y mueve el stock (no se edita ni se anula)' })
  create(
    @Body() body: CreateAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdjustmentView> {
    return this.adjustments.create(
      {
        date: body.date,
        productId: body.productId,
        warehouseId: body.warehouseId,
        type: body.type,
        quantity: body.quantity,
        reason: body.reason,
        notes: body.notes,
      },
      user,
    );
  }
}
