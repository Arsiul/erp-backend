import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../../shared/presentation/listing/list-query.dto';
import { PAYABLE_FILTERS, type PayableFilter } from '../../domain/payable';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '../../domain/purchase-order';
import { RECEIPT_STATUSES, type ReceiptStatus } from '../../domain/receipt';
import {
  SUPPLIER_INVOICE_STATUSES,
  type SupplierInvoiceStatus,
} from '../../domain/supplier-invoice';

const STATUS_MESSAGE = { message: 'El estado no es válido.' };

class SupplierQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ example: 'sup-1' })
  @IsOptional()
  @IsString({ message: 'El proveedor no es válido.' })
  readonly supplierId?: string;
}

export class PurchaseOrderQueryDto extends SupplierQueryDto {
  @ApiPropertyOptional({ enum: PURCHASE_ORDER_STATUSES })
  @IsOptional()
  @IsIn(PURCHASE_ORDER_STATUSES, STATUS_MESSAGE)
  readonly status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ example: 'wh-1' })
  @IsOptional()
  @IsString({ message: 'El almacén no es válido.' })
  readonly warehouseId?: string;
}

export class ReceiptQueryDto extends SupplierQueryDto {
  @ApiPropertyOptional({ enum: RECEIPT_STATUSES })
  @IsOptional()
  @IsIn(RECEIPT_STATUSES, STATUS_MESSAGE)
  readonly status?: ReceiptStatus;

  @ApiPropertyOptional({ example: 'po-1' })
  @IsOptional()
  @IsString({ message: 'La orden de compra no es válida.' })
  readonly purchaseOrderId?: string;
}

export class SupplierInvoiceQueryDto extends SupplierQueryDto {
  @ApiPropertyOptional({ enum: SUPPLIER_INVOICE_STATUSES })
  @IsOptional()
  @IsIn(SUPPLIER_INVOICE_STATUSES, STATUS_MESSAGE)
  readonly status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({ example: 'rec-1' })
  @IsOptional()
  @IsString({ message: 'La recepción no es válida.' })
  readonly receiptId?: string;
}

export class PayableQueryDto extends SupplierQueryDto {
  @ApiPropertyOptional({
    enum: PAYABLE_FILTERS,
    description: '`overdue`: pendientes o parciales con vencimiento anterior a hoy (Lima).',
  })
  @IsOptional()
  @IsIn(PAYABLE_FILTERS, STATUS_MESSAGE)
  readonly status?: PayableFilter;
}
