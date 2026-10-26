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
import { type QuoteInput, QuotesUseCases } from '../application/quotes.use-cases';
import type { QuoteRecord } from '../domain/commercial';
import { QuoteBodyDto } from './dto/commercial-body.dto';
import { QuoteQueryDto } from './dto/commercial-query.dto';

const quoteFields = (body: QuoteBodyDto): QuoteInput => ({
  customerId: body.customerId,
  issuedAt: body.issuedAt,
  validUntil: body.validUntil,
  seller: body.seller,
  lines: body.lines,
  notes: body.notes,
});

@ApiTags('comercial')
@ApiBearerAuth()
@Controller('cotizaciones')
export class QuotesController {
  constructor(private readonly quotes: QuotesUseCases) {}

  @Get()
  @RequirePermission('cotizaciones', 'read')
  @ApiOperation({ summary: 'Cotizaciones con filtros (status admite overdue)' })
  async list(
    @Query() query: QuoteQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly QuoteRecord[]> {
    return listBody(res, await this.quotes.list(query));
  }

  @Get(':id')
  @RequirePermission('cotizaciones', 'read')
  @ApiOperation({ summary: 'Una cotización' })
  get(@Param('id') id: string): Promise<QuoteRecord> {
    return this.quotes.get(id);
  }

  @Post()
  @RequirePermission('cotizaciones', 'write')
  @ApiOperation({ summary: 'Registra una cotización en borrador' })
  create(@Body() body: QuoteBodyDto, @CurrentUser() user: AuthenticatedUser): Promise<QuoteRecord> {
    return this.quotes.create(quoteFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('cotizaciones', 'write')
  @ApiOperation({ summary: 'Edita una cotización en borrador o enviada' })
  update(
    @Param('id') id: string,
    @Body() body: QuoteBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteRecord> {
    return this.quotes.update(id, quoteFields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('cotizaciones', 'write')
  @ApiOperation({ summary: 'Elimina una cotización en borrador' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.quotes.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cotizaciones', 'write')
  @ApiOperation({ summary: 'Acción sobre la cotización (send, accept, reject)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteRecord> {
    return this.quotes.runAction(id, action, user);
  }
}
