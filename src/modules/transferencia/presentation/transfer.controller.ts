import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { CurrentUser, RequireResourcePermission } from '../../../shared/presentation/auth/auth.decorators';
import { ParseResourceKeyPipe } from '../../../shared/presentation/auth/resource-key.pipe';
import { TransferUseCases } from '../application/transfer.use-cases';

export class ImportCsvDto {
  @IsString()
  @MaxLength(5_000_000)
  csv!: string;
}

@ApiTags('Transferencia')
@ApiBearerAuth()
@Controller('transferencia/:resource')
export class TransferController {
  constructor(private readonly transfer: TransferUseCases) {}

  @Get('exportar')
  @RequireResourcePermission('resource')
  @ApiOperation({ summary: 'Exporta los datos del módulo en CSV' })
  async export(
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.transfer.exportCsv(resource));
  }

  @Get('plantilla')
  @RequireResourcePermission('resource')
  @ApiOperation({ summary: 'Plantilla CSV vacía para importar' })
  template(
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
    @Res() res: Response,
  ): void {
    send(res, this.transfer.template(resource));
  }

  @Post('importar')
  @HttpCode(200)
  @RequireResourcePermission('resource')
  @ApiOperation({ summary: 'Importa un CSV: valida todo y guarda todo o nada' })
  import(
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
    @Body() body: ImportCsvDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfer.importCsv(resource, body.csv, user);
  }
}

function send(res: Response, { file, csv }: { file: string; csv: string }): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.send(csv);
}
