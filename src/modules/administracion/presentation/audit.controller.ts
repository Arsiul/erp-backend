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
import { AuditQueries } from '../application/audit.queries';
import type { AuditView } from '../domain/audit-record';
import { AuditQueryDto } from './dto/list-query.dto';
import { listBody } from '../../../shared/presentation/listing/list-response';

/** The audit trail is written by the system only: reads are allowed, writes answer 405. */
@ApiTags('administracion')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditQueries) {}

  @Get()
  @RequirePermission('auditoria', 'read')
  @ApiOperation({ summary: 'Bitácora de auditoría con filtros y paginación' })
  async list(
    @Query() query: AuditQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly AuditView[]> {
    return listBody(res, await this.audit.list(query));
  }

  @Get(':id')
  @RequirePermission('auditoria', 'read')
  @ApiOperation({ summary: 'Un registro de auditoría' })
  get(@Param('id') id: string): Promise<AuditView> {
    return this.audit.get(id);
  }

  @Post()
  @RequirePermission('auditoria', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  create(): never {
    throw new OperationNotAllowedError('Este registro no se crea manualmente.');
  }

  @Patch(':id')
  @RequirePermission('auditoria', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('auditoria', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('auditoria', 'write')
  @ApiOperation({ summary: 'Acción sobre el registro (la auditoría no tiene acciones)' })
  runAction(@Param('id') id: string, @Param('action') action: string): Promise<AuditView> {
    return this.audit.runAction(id, action);
  }
}
