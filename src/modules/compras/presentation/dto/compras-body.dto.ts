import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

/*
 * Bodies only declare which fields are accepted: the domain rules check their values and answer
 * the same 422 messages as the frontend mock. The derived fields of a record (`id`, `number`,
 * names, totals, `status`…) are accepted because the forms send the whole record back; the
 * controllers never forward them to the use cases.
 */

const LINES_EXAMPLE = [{ productId: 'prd-1', quantity: 10, unitPrice: 12.5 }];

export class PurchaseOrderDto {
  @ApiPropertyOptional({ example: 'sup-1' })
  @Allow()
  readonly supplierId?: unknown;

  @ApiPropertyOptional({ example: 'wh-1' })
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Por defecto, hoy (Lima).' })
  @Allow()
  readonly issuedAt?: unknown;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Por defecto, emisión + 7 días.' })
  @Allow()
  readonly expectedAt?: unknown;

  @ApiPropertyOptional({ example: LINES_EXAMPLE })
  @Allow()
  readonly lines?: unknown;

  @ApiPropertyOptional({ example: 'Entrega en horario de mañana' })
  @Allow()
  readonly notes?: unknown;

  @Allow() readonly id?: unknown;
  @Allow() readonly number?: unknown;
  @Allow() readonly supplierName?: unknown;
  @Allow() readonly warehouseName?: unknown;
  @Allow() readonly subtotal?: unknown;
  @Allow() readonly igv?: unknown;
  @Allow() readonly total?: unknown;
  @Allow() readonly status?: unknown;
}

export class ReceiptDto {
  @ApiPropertyOptional({ example: 'po-1' })
  @Allow()
  readonly purchaseOrderId?: unknown;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Por defecto, hoy (Lima).' })
  @Allow()
  readonly receivedAt?: unknown;

  @ApiPropertyOptional({ example: 'T001-000123' })
  @Allow()
  readonly guideNumber?: unknown;

  @ApiPropertyOptional({
    example: [{ productId: 'prd-1', quantity: 4 }],
    description: 'Unidades recibidas por producto de la orden; el precio es el de la orden.',
  })
  @Allow()
  readonly lines?: unknown;

  @Allow() readonly id?: unknown;
  @Allow() readonly number?: unknown;
  @Allow() readonly purchaseOrderNumber?: unknown;
  @Allow() readonly supplierId?: unknown;
  @Allow() readonly supplierName?: unknown;
  @Allow() readonly warehouseId?: unknown;
  @Allow() readonly warehouseName?: unknown;
  @Allow() readonly subtotal?: unknown;
  @Allow() readonly status?: unknown;
  @Allow() readonly supplierInvoiceNumber?: unknown;
}

export class SupplierInvoiceDto {
  @ApiPropertyOptional({ example: 'F001-000456' })
  @Allow()
  readonly documentNumber?: unknown;

  @ApiPropertyOptional({ example: 'sup-1', description: 'Con recepción, el de la recepción.' })
  @Allow()
  readonly supplierId?: unknown;

  @ApiPropertyOptional({ example: 'rec-1' })
  @Allow()
  readonly receiptId?: unknown;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Por defecto, hoy (Lima).' })
  @Allow()
  readonly issuedAt?: unknown;

  @ApiPropertyOptional({
    example: '2026-11-24',
    description: 'Por defecto, emisión + días de pago del proveedor.',
  })
  @Allow()
  readonly dueAt?: unknown;

  @ApiPropertyOptional({ example: 250, description: 'Con recepción, el de la recepción.' })
  @Allow()
  readonly subtotal?: unknown;

  @Allow() readonly id?: unknown;
  @Allow() readonly supplierName?: unknown;
  @Allow() readonly receiptNumber?: unknown;
  @Allow() readonly igv?: unknown;
  @Allow() readonly total?: unknown;
  @Allow() readonly status?: unknown;
}
