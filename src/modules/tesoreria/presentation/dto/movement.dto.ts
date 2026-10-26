import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import {
  MOVEMENT_CONCEPTS,
  MOVEMENT_STATUSES,
  MOVEMENT_TYPES,
  type MovementConcept,
  type MovementStatus,
  type MovementType,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../domain/treasury';

export class MovementQueryDto extends ListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'La cuenta no es válida.' })
  readonly accountId?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(MOVEMENT_TYPES, { message: 'El tipo no es válido.' })
  readonly type?: MovementType;

  @ApiPropertyOptional({ enum: MOVEMENT_CONCEPTS })
  @IsOptional()
  @IsIn(MOVEMENT_CONCEPTS, { message: 'El concepto no es válido.' })
  readonly concept?: MovementConcept;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS, { message: 'El medio de pago no es válido.' })
  readonly method?: PaymentMethod;

  @ApiPropertyOptional({ enum: MOVEMENT_STATUSES })
  @IsOptional()
  @IsIn(MOVEMENT_STATUSES, { message: 'El estado no es válido.' })
  readonly status?: MovementStatus;
}

/*
 * The body only declares which fields are accepted: the domain rules check their values. Derived
 * fields (names, number, status) are accepted because the form sends the whole record back.
 */
export class MovementBodyDto {
  @ApiPropertyOptional({ example: '2026-10-25' })
  @Allow()
  readonly date?: unknown;

  @ApiPropertyOptional({ example: 'ba-1' })
  @Allow()
  readonly accountId?: unknown;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @Allow()
  readonly type?: unknown;

  @ApiPropertyOptional({ enum: MOVEMENT_CONCEPTS })
  @Allow()
  readonly concept?: unknown;

  @ApiPropertyOptional({ example: '' })
  @Allow()
  readonly receivableId?: unknown;

  @ApiPropertyOptional({ example: '' })
  @Allow()
  readonly payableId?: unknown;

  @ApiPropertyOptional({ example: 'Cliente SAC' })
  @Allow()
  readonly counterparty?: unknown;

  @ApiPropertyOptional({ example: '' })
  @Allow()
  readonly reference?: unknown;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @Allow()
  readonly method?: unknown;

  @ApiPropertyOptional({ example: 150 })
  @Allow()
  readonly amount?: unknown;

  @ApiPropertyOptional({ example: '' })
  @Allow()
  readonly notes?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly number?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly accountName?: unknown;

  @ApiPropertyOptional({ enum: MOVEMENT_STATUSES, readOnly: true })
  @Allow()
  readonly status?: unknown;
}
