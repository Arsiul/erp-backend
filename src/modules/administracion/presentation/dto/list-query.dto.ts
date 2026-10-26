import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { MODULE_IDS, type ModuleId } from '../../../../shared/domain/module-id';
import {
  ACTIVE_STATUSES,
  type ActiveStatus,
} from '../../../../shared/domain/validation/field-rules';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';

export class UserQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'El estado no es válido.' })
  readonly status?: ActiveStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'El rol no es válido.' })
  readonly roleId?: string;
}

export class AuditQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: MODULE_IDS })
  @IsOptional()
  @IsIn(MODULE_IDS, { message: 'El módulo no es válido.' })
  readonly module?: ModuleId;

  @ApiPropertyOptional({ example: 'ventas' })
  @IsOptional()
  @IsString({ message: 'El recurso no es válido.' })
  readonly resource?: string;
}
