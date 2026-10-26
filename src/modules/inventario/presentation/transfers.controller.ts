import {
  Body,
  Controller,
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
import { TransfersUseCases } from '../application/transfers.use-cases';
import type { TransferView } from '../domain/inventory';
import type { TransferInput } from '../domain/transfer-rules';
import { TransferBodyDto } from './dto/inventory-body.dto';
import { TransferQueryDto } from './dto/inventory-query.dto';

const transferFields = (body: TransferBodyDto): TransferInput => ({
  date: body.date,
  productId: body.productId,
  originWarehouseId: body.originWarehouseId,
  destinationWarehouseId: body.destinationWarehouseId,
  quantity: body.quantity,
  notes: body.notes,
});

@ApiTags('inventario')
@ApiBearerAuth()
@Controller('transferencias')
export class TransfersController {
  constructor(private readonly transfers: TransfersUseCases) {}

  @Get()
  @RequirePermission('transferencias', 'read')
  @ApiOperation({ summary: 'Transferencias entre almacenes' })
  async list(
    @Query() query: TransferQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly TransferView[]> {
    return listBody(res, await this.transfers.list(query));
  }

  @Get(':id')
  @RequirePermission('transferencias', 'read')
  @ApiOperation({ summary: 'Una transferencia' })
  get(@Param('id') id: string): Promise<TransferView> {
    return this.transfers.get(id);
  }

  @Post()
  @RequirePermission('transferencias', 'write')
  @ApiOperation({ summary: 'Registra una transferencia pendiente' })
  create(
    @Body() body: TransferBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransferView> {
    return this.transfers.create(transferFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('transferencias', 'write')
  @ApiOperation({ summary: 'Edita una transferencia pendiente (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: TransferBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransferView> {
    return this.transfers.update(id, transferFields(body), user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('transferencias', 'write')
  @ApiOperation({ summary: 'Acción sobre la transferencia (complete, cancel)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransferView> {
    return this.transfers.runAction(id, action, user);
  }
}
