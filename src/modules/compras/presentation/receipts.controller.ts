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
import { ReceiptsUseCases } from '../application/receipts.use-cases';
import type { ReceiptView } from '../domain/receipt';
import { ReceiptDto } from './dto/compras-body.dto';
import { ReceiptQueryDto } from './dto/compras-query.dto';

@ApiTags('compras')
@ApiBearerAuth()
@Controller('recepciones')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsUseCases) {}

  @Get()
  @RequirePermission('recepciones', 'read')
  @ApiOperation({ summary: 'Recepciones (filtros: estado, orden, proveedor, fecha de recepción)' })
  async list(
    @Query() query: ReceiptQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly ReceiptView[]> {
    return listBody(res, await this.receipts.list(query));
  }

  @Get(':id')
  @RequirePermission('recepciones', 'read')
  @ApiOperation({ summary: 'Una recepción' })
  get(@Param('id') id: string): Promise<ReceiptView> {
    return this.receipts.get(id);
  }

  @Post()
  @RequirePermission('recepciones', 'write')
  @ApiOperation({
    summary: 'Recibe (total o parcialmente) una orden aprobada: entra stock y kardex (REC-00001)',
  })
  create(@Body() body: ReceiptDto, @CurrentUser() user: AuthenticatedUser): Promise<ReceiptView> {
    return this.receipts.create(
      {
        purchaseOrderId: body.purchaseOrderId,
        receivedAt: body.receivedAt,
        guideNumber: body.guideNumber,
        lines: body.lines,
      },
      user,
    );
  }

  @Patch(':id')
  @RequirePermission('recepciones', 'write')
  @ApiOperation({ summary: 'Corrige la guía de remisión (lo demás ya movió el stock)' })
  update(
    @Param('id') id: string,
    @Body() body: ReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReceiptView> {
    return this.receipts.update(id, { guideNumber: body.guideNumber }, user);
  }

  @Delete(':id')
  @RequirePermission('recepciones', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('recepciones', 'write')
  @ApiOperation({ summary: 'cancel: revierte stock y kardex (solo sin facturar)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReceiptView> {
    return this.receipts.runAction(id, action, user);
  }
}
