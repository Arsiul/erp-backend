import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import {
  INVOICE_STATUSES,
  type InvoiceStatus,
  QUOTE_FILTERS,
  type QuoteFilter,
  RECEIVABLE_FILTERS,
  type ReceivableFilter,
  SALE_STATUSES,
  type SaleStatus,
} from '../../domain/commercial';

const STATUS_MESSAGE = 'El estado no es válido.';

export class QuoteQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: QUOTE_FILTERS })
  @IsOptional()
  @IsIn(QUOTE_FILTERS, { message: STATUS_MESSAGE })
  readonly status?: QuoteFilter;
}

export class SaleQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: SALE_STATUSES })
  @IsOptional()
  @IsIn(SALE_STATUSES, { message: STATUS_MESSAGE })
  readonly status?: SaleStatus;
}

export class InvoiceQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: INVOICE_STATUSES })
  @IsOptional()
  @IsIn(INVOICE_STATUSES, { message: STATUS_MESSAGE })
  readonly status?: InvoiceStatus;
}

export class ReceivableQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: RECEIVABLE_FILTERS })
  @IsOptional()
  @IsIn(RECEIVABLE_FILTERS, { message: STATUS_MESSAGE })
  readonly status?: ReceivableFilter;

  @ApiPropertyOptional({ example: 'cus-1' })
  @IsOptional()
  @IsString({ message: 'El cliente no es válido.' })
  readonly customerId?: string;
}
