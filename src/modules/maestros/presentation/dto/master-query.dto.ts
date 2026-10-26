import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  ACTIVE_STATUSES,
  type ActiveStatus,
} from '../../../../shared/domain/validation/field-rules';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import { CUSTOMER_DOCUMENT_TYPES, type CustomerDocumentType } from '../../domain/master-fields';

export class MasterQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'El estado no es válido.' })
  readonly status?: ActiveStatus;
}

export class CustomerQueryDto extends MasterQueryDto {
  @ApiPropertyOptional({ enum: CUSTOMER_DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_DOCUMENT_TYPES, { message: 'El tipo de documento no es válido.' })
  readonly documentType?: CustomerDocumentType;
}

export class ProductQueryDto extends MasterQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'La categoría no es válida.' })
  readonly categoryId?: string;
}
