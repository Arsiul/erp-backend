import {
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
import { OperationNotAllowedError } from '../../../shared/domain/errors/domain-error';
import { RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { PayablesUseCases } from '../application/payables.use-cases';
import type { PayableView } from '../domain/payable';
import { PayableQueryDto } from './dto/compras-query.dto';

@ApiTags('compras')
@ApiBearerAuth()
@Controller('cuentas-pagar')
export class PayablesController {
  constructor(private readonly payables: PayablesUseCases) {}

  @Get()
  @RequirePermission('cuentas-pagar', 'read')
  @ApiOperation({
    summary: 'Cuentas por pagar (filtros: estado u overdue, proveedor, vencimiento)',
  })
  async list(
    @Query() query: PayableQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly PayableView[]> {
    return listBody(res, await this.payables.list(query));
  }

  @Get(':id')
  @RequirePermission('cuentas-pagar', 'read')
  @ApiOperation({ summary: 'Una cuenta por pagar' })
  get(@Param('id') id: string): Promise<PayableView> {
    return this.payables.get(id);
  }

  @Post()
  @RequirePermission('cuentas-pagar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  create(): never {
    throw new OperationNotAllowedError('Este registro no se crea manualmente.');
  }

  @Patch(':id')
  @RequirePermission('cuentas-pagar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('cuentas-pagar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cuentas-pagar', 'write')
  @ApiOperation({ summary: 'Acción sobre la cuenta (las cuentas por pagar no tienen acciones)' })
  runAction(@Param('id') id: string, @Param('action') action: string): Promise<PayableView> {
    return this.payables.runAction(id, action);
  }
}
