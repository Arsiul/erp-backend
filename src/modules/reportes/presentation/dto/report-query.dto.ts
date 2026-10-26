import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Report query string; the use case validates the dates and the party. */
export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Fecha inicial (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'La fecha inicial no es válida.' })
  readonly from?: string;

  @ApiPropertyOptional({ description: 'Fecha final (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'La fecha final no es válida.' })
  readonly to?: string;

  @ApiPropertyOptional({ description: 'Cliente, proveedor, almacén o tipo de saldo' })
  @IsOptional()
  @IsString({ message: 'El filtro no es válido.' })
  readonly party?: string;
}
