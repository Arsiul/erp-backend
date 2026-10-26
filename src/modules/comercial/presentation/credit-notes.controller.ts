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
import { ListQueryDto } from '../../../shared/presentation/listing/list-query.dto';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { type CreditNoteInput, CreditNotesUseCases } from '../application/credit-notes.use-cases';
import type { CreditNoteRecord } from '../domain/commercial';
import { CreditNoteBodyDto } from './dto/commercial-body.dto';

const creditNoteFields = (body: CreditNoteBodyDto): CreditNoteInput => ({
  invoiceId: body.invoiceId,
  issuedAt: body.issuedAt,
  reason: body.reason,
  lines: body.lines,
  notes: body.notes,
});

@ApiTags('comercial')
@ApiBearerAuth()
@Controller('notas-credito')
export class CreditNotesController {
  constructor(private readonly notes: CreditNotesUseCases) {}

  @Get()
  @RequirePermission('notas-credito', 'read')
  @ApiOperation({ summary: 'Notas de crédito con filtros' })
  async list(
    @Query() query: ListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly CreditNoteRecord[]> {
    return listBody(res, await this.notes.list(query));
  }

  @Get(':id')
  @RequirePermission('notas-credito', 'read')
  @ApiOperation({ summary: 'Una nota de crédito' })
  get(@Param('id') id: string): Promise<CreditNoteRecord> {
    return this.notes.get(id);
  }

  @Post()
  @RequirePermission('notas-credito', 'write')
  @ApiOperation({ summary: 'Emite una nota de crédito sobre un comprobante' })
  create(
    @Body() body: CreditNoteBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreditNoteRecord> {
    return this.notes.create(creditNoteFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('notas-credito', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  update(): never {
    throw new OperationNotAllowedError('Este registro no se puede editar.');
  }

  @Delete(':id')
  @RequirePermission('notas-credito', 'write')
  @ApiOperation({ summary: 'No permitido (405)' })
  remove(): never {
    throw new OperationNotAllowedError('Este registro no se puede eliminar.');
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notas-credito', 'write')
  @ApiOperation({ summary: 'Acción sobre la nota (no tiene acciones)' })
  runAction(@Param('id') id: string, @Param('action') action: string): Promise<CreditNoteRecord> {
    return this.notes.runAction(id, action);
  }
}
