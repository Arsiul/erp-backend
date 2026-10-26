import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { ADJUSTMENT_REASONS, ADJUSTMENT_TYPES, TRANSFER_STATUSES } from '../../domain/inventory';

/*
 * Bodies only declare which fields are accepted: the domain rules check their values. Derived
 * fields (names, number, status) are accepted because the forms send the whole record back.
 */

export class UpdateStockDto {
  @ApiPropertyOptional({ example: 5 })
  @Allow()
  readonly minStock?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly productId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly productName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly sku?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly categoryName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly unit?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly quantity?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly unitCost?: unknown;
}

class DocumentFieldsDto {
  @ApiPropertyOptional({ example: '2026-10-25' })
  @Allow()
  readonly date?: unknown;

  @ApiPropertyOptional({ example: 'prd-1' })
  @Allow()
  readonly productId?: unknown;

  @ApiPropertyOptional({ example: 3 })
  @Allow()
  readonly quantity?: unknown;

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
  readonly productName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly sku?: unknown;
}

export class CreateAdjustmentDto extends DocumentFieldsDto {
  @ApiPropertyOptional({ example: 'wh-1' })
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ enum: ADJUSTMENT_TYPES })
  @Allow()
  readonly type?: unknown;

  @ApiPropertyOptional({ enum: ADJUSTMENT_REASONS })
  @Allow()
  readonly reason?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseName?: unknown;
}

export class TransferBodyDto extends DocumentFieldsDto {
  @ApiPropertyOptional({ example: 'wh-1' })
  @Allow()
  readonly originWarehouseId?: unknown;

  @ApiPropertyOptional({ example: 'wh-2' })
  @Allow()
  readonly destinationWarehouseId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly originWarehouseName?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly destinationWarehouseName?: unknown;

  @ApiPropertyOptional({ enum: TRANSFER_STATUSES, readOnly: true })
  @Allow()
  readonly status?: unknown;
}
