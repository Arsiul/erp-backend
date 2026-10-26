import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '../../domain/document';

/**
 * Text fields of the multipart form. The derived ones the frontend may echo back (file data,
 * label, uploader) are accepted and ignored: the server computes them.
 */
export class DocumentBodyDto {
  @ApiPropertyOptional() @Allow() readonly id?: unknown;
  @ApiPropertyOptional() @Allow() readonly name?: unknown;
  @ApiPropertyOptional({ enum: DOCUMENT_CATEGORIES }) @Allow() readonly category?: unknown;
  @ApiPropertyOptional() @Allow() readonly linkedResource?: unknown;
  @ApiPropertyOptional() @Allow() readonly linkedId?: unknown;
  @ApiPropertyOptional() @Allow() readonly linkedLabel?: unknown;
  @ApiPropertyOptional() @Allow() readonly fileName?: unknown;
  @ApiPropertyOptional() @Allow() readonly fileSize?: unknown;
  @ApiPropertyOptional() @Allow() readonly mimeType?: unknown;
  @ApiPropertyOptional() @Allow() readonly content?: unknown;
  @ApiPropertyOptional() @Allow() readonly uploadedAt?: unknown;
  @ApiPropertyOptional() @Allow() readonly uploadedBy?: unknown;
}

export class DocumentQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DOCUMENT_CATEGORIES })
  @IsOptional()
  @IsIn(DOCUMENT_CATEGORIES, { message: 'La categoría no es válida.' })
  readonly category?: DocumentCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'El módulo vinculado no es válido.' })
  readonly linkedResource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'El registro vinculado no es válido.' })
  readonly linkedId?: string;
}
