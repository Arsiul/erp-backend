import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { KardexOrigin } from '../../../../shared/domain/ports/stock-ledger.port';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_TYPES,
  type AdjustmentReason,
  type AdjustmentType,
  KARDEX_ORIGINS,
  TRANSFER_STATUSES,
  type TransferStatus,
} from '../../domain/inventory';

export class StockQueryDto extends ListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'El producto no es válido.' })
  readonly productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'El almacén no es válido.' })
  readonly warehouseId?: string;
}

export class KardexQueryDto extends StockQueryDto {
  @ApiPropertyOptional({ enum: KARDEX_ORIGINS })
  @IsOptional()
  @IsIn(KARDEX_ORIGINS, { message: 'El origen no es válido.' })
  readonly origin?: KardexOrigin;
}

export class AdjustmentQueryDto extends StockQueryDto {
  @ApiPropertyOptional({ enum: ADJUSTMENT_TYPES })
  @IsOptional()
  @IsIn(ADJUSTMENT_TYPES, { message: 'El tipo no es válido.' })
  readonly type?: AdjustmentType;

  @ApiPropertyOptional({ enum: ADJUSTMENT_REASONS })
  @IsOptional()
  @IsIn(ADJUSTMENT_REASONS, { message: 'El motivo no es válido.' })
  readonly reason?: AdjustmentReason;
}

/** `warehouseId` matches the origin or the destination. */
export class TransferQueryDto extends StockQueryDto {
  @ApiPropertyOptional({ enum: TRANSFER_STATUSES })
  @IsOptional()
  @IsIn(TRANSFER_STATUSES, { message: 'El estado no es válido.' })
  readonly status?: TransferStatus;
}
