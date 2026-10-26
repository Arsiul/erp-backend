import { ApiProperty, type ApiPropertyOptions, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { MODULE_IDS } from '../../../../shared/domain/module-id';
import { ACCESS_LEVELS } from '../../../../shared/domain/authorization/access-level';
import { ACTIVE_STATUSES } from '../../../../shared/domain/validation/field-rules';

/*
 * Bodies only declare which fields are accepted: the domain rules check their values and answer
 * the same 422 messages as the frontend mock. The derived fields of a record (`id`, `roleName`,
 * `system`…) are accepted because the forms send the whole record back on PATCH; the controllers
 * never forward them to the use cases.
 */

const PERMISSIONS_SCHEMA: ApiPropertyOptions = {
  type: 'object',
  additionalProperties: false,
  description: 'Nivel de acceso por módulo.',
  properties: Object.fromEntries(
    MODULE_IDS.map((module) => [module, { type: 'string', enum: [...ACCESS_LEVELS] }]),
  ),
};

class UserFieldsDto {
  @ApiPropertyOptional({ example: 'Lucía Paredes' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ example: 'lucia@empresa.pe' })
  @Allow()
  readonly email?: unknown;

  @ApiPropertyOptional({ example: 'role-ventas' })
  @Allow()
  readonly roleId?: unknown;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @Allow()
  readonly status?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly roleName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly lastAccessAt?: unknown;
}

export class CreateUserDto extends UserFieldsDto {
  @ApiProperty({ minLength: 8, description: 'Contraseña inicial.' })
  @Allow()
  readonly password?: unknown;
}

export class UpdateUserDto extends UserFieldsDto {}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @Allow()
  readonly password?: unknown;
}

export class RoleDto {
  @ApiPropertyOptional({ example: 'Ventas' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly description?: unknown;

  @ApiPropertyOptional(PERMISSIONS_SCHEMA)
  @Allow()
  readonly permissions?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly system?: unknown;
}

export class SettingsDto {
  @ApiPropertyOptional()
  @Allow()
  readonly companyName?: unknown;

  @ApiPropertyOptional({ example: '20123456789' })
  @Allow()
  readonly ruc?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly address?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly phone?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly email?: unknown;

  @ApiPropertyOptional({ example: 0.18, description: 'Fracción (0.18 = 18 %).' })
  @Allow()
  readonly igvRate?: unknown;

  @ApiPropertyOptional({ example: 'F001' })
  @Allow()
  readonly invoiceSeries?: unknown;

  @ApiPropertyOptional({ example: 'B001' })
  @Allow()
  readonly receiptSeries?: unknown;

  @ApiPropertyOptional({ example: 'FC01' })
  @Allow()
  readonly creditNoteSeries?: unknown;

  @ApiPropertyOptional({ example: 15 })
  @Allow()
  readonly quoteValidityDays?: unknown;
}
