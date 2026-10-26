import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { ACTIVE_STATUSES } from '../../../../shared/domain/validation/field-rules';
import { CUSTOMER_DOCUMENT_TYPES } from '../../domain/master-fields';

/*
 * Bodies only declare which fields are accepted: the domain rules check their values and answer
 * the same 422 messages as the frontend mock. Derived fields (`id`, `code`, `categoryName`,
 * `balance`) are accepted because the forms send the whole record back on PATCH; the controllers
 * never forward them to the use cases.
 */

class MasterBodyDto {
  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @Allow()
  readonly status?: unknown;
}

class CodedBodyDto extends MasterBodyDto {
  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly code?: unknown;
}

export class CustomerBodyDto extends CodedBodyDto {
  @ApiPropertyOptional({ example: 'Comercial Andina SAC' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ enum: CUSTOMER_DOCUMENT_TYPES })
  @Allow()
  readonly documentType?: unknown;

  @ApiPropertyOptional({ example: '20512345678' })
  @Allow()
  readonly documentNumber?: unknown;

  @ApiPropertyOptional({ example: 'compras@andina.pe' })
  @Allow()
  readonly email?: unknown;

  @ApiPropertyOptional({ example: '01 234 5678' })
  @Allow()
  readonly phone?: unknown;

  @ApiPropertyOptional({ example: 'Av. Arequipa 123, Lima' })
  @Allow()
  readonly address?: unknown;

  @ApiPropertyOptional({ example: 30, description: 'Días de crédito; 0 = solo contado.' })
  @Allow()
  readonly creditDays?: unknown;

  @ApiPropertyOptional({ example: 15000 })
  @Allow()
  readonly creditLimit?: unknown;
}

export class SupplierBodyDto extends CodedBodyDto {
  @ApiPropertyOptional({ example: 'Distribuidora del Sur SAC' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ example: '20456789012' })
  @Allow()
  readonly ruc?: unknown;

  @ApiPropertyOptional({ example: 'Jorge Salinas' })
  @Allow()
  readonly contactName?: unknown;

  @ApiPropertyOptional({ example: 'ventas@delsur.pe' })
  @Allow()
  readonly email?: unknown;

  @ApiPropertyOptional({ example: '01 987 6543' })
  @Allow()
  readonly phone?: unknown;

  @ApiPropertyOptional({ example: 'Calle Los Pinos 456, Arequipa' })
  @Allow()
  readonly address?: unknown;

  @ApiPropertyOptional({ example: 30 })
  @Allow()
  readonly paymentDays?: unknown;
}

export class CategoryBodyDto extends CodedBodyDto {
  @ApiPropertyOptional({ example: 'Ferretería' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ example: 'Herramientas y accesorios' })
  @Allow()
  readonly description?: unknown;
}

export class WarehouseBodyDto extends CodedBodyDto {
  @ApiPropertyOptional({ example: 'Almacén Central' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ example: 'Av. Industrial 789, Lima' })
  @Allow()
  readonly address?: unknown;

  @ApiPropertyOptional({ example: 'Rosa Medina' })
  @Allow()
  readonly manager?: unknown;
}

export class ProductBodyDto extends MasterBodyDto {
  @ApiPropertyOptional({ example: 'FER-001' })
  @Allow()
  readonly sku?: unknown;

  @ApiPropertyOptional({ example: 'Martillo de acero' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly categoryId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly categoryName?: unknown;

  @ApiPropertyOptional({ example: 'UND' })
  @Allow()
  readonly unit?: unknown;

  @ApiPropertyOptional({ example: 35.9 })
  @Allow()
  readonly salePrice?: unknown;

  @ApiPropertyOptional({ example: 22.5 })
  @Allow()
  readonly costPrice?: unknown;

  @ApiPropertyOptional({ example: 10 })
  @Allow()
  readonly minStock?: unknown;
}

export class BankAccountBodyDto extends MasterBodyDto {
  @ApiPropertyOptional({ example: 'BCP' })
  @Allow()
  readonly bank?: unknown;

  @ApiPropertyOptional({ example: 'Cuenta corriente soles' })
  @Allow()
  readonly name?: unknown;

  @ApiPropertyOptional({ example: '191-1234567-0-12' })
  @Allow()
  readonly accountNumber?: unknown;

  @ApiPropertyOptional({ example: 5000, description: 'Solo se toma al crear la cuenta.' })
  @Allow()
  readonly openingBalance?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly balance?: unknown;
}
