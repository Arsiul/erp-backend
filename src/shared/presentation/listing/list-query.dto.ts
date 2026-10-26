import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { SortOrder } from '../../domain/listing/list-criteria';

const MAX_QUERY_LENGTH = 200;
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

/**
 * Query of `GET /:resource`. The dates are validated by the use case, which answers the same
 * 422 message as the frontend; here only their type is checked.
 */
export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda libre, sin distinguir mayúsculas.' })
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida.' })
  @MaxLength(MAX_QUERY_LENGTH, { message: 'La búsqueda es demasiado larga.' })
  readonly q?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Día de Lima, inclusive.' })
  @IsOptional()
  @IsString({ message: 'La fecha no es válida.' })
  readonly from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Día de Lima, inclusive.' })
  @IsOptional()
  @IsString({ message: 'La fecha no es válida.' })
  readonly to?: string;

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'El orden no es válido.' })
  readonly sort?: SortOrder;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Sin `page` se devuelven hasta 5000 registros (X-Total-Count si hay más).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página no es válida.' })
  @Min(1, { message: 'La página no es válida.' })
  readonly page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página no es válido.' })
  @Min(1, { message: 'El tamaño de página no es válido.' })
  readonly pageSize?: number;
}
