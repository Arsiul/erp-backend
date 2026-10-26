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
import { ReceivablesUseCases } from '../application/receivables.use-cases';
import type { ReceivableRecord } from '../domain/commercial';
import { ReceivableQueryDto } from './dto/commercial-query.dto';

/** Receivables move with invoices, credit notes and collections: writes answer 405. */
@ApiTags('comercial')
@ApiBearerAuth()
@Controller('cuentas-cobrar')
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesUseCases) {}

  @Get()
  @RequirePermission('cuentas-cobrar', 'read')
  @ApiOperation({ summary: 'Cuentas por cobrar con filtros (status admite overdue)' })
  async list(
    @Query() query: ReceivableQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly ReceivableRecord[]> {
    return listBody(res, await this.receivables.list(query));
  }

  @Get(':id')
  @RequirePermission('cuentas-cobrar', 'read')
  @ApiOperation({ summary: 'Una cuenta por cobrar' })
  get(@Param('id') id: string): Promise<ReceivableRecord> {
    return this.receivables.get(id);
  }

  @Post()
  @RequirePermission('cuentas-cobrar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  create(): never {
    throw new OperationNotAllowedError('Este registro no se crea manualmente.');
  }

  @Patch(':id')
  @RequirePermission('cuentas-cobrar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('cuentas-cobrar', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cuentas-cobrar', 'write')
  @ApiOperation({ summary: 'Acción sobre la cuenta (no tiene acciones)' })
  runAction(@Param('id') id: string, @Param('action') action: string): Promise<ReceivableRecord> {
    return this.receivables.runAction(id, action);
  }
}
