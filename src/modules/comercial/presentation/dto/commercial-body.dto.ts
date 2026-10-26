import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { CREDIT_NOTE_REASONS, INVOICE_KINDS, PAYMENT_TERMS } from '../../domain/commercial';

/*
 * Bodies only declare which fields are accepted: the domain rules check their values. Derived
 * fields (names, number, totals, status) are accepted because the forms send the whole record.
 */

const LINES_EXAMPLE = [{ productId: '<uuid>', quantity: 2, unitPrice: 10.5 }];

class DocumentBodyDto {
  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly id?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly number?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly customerId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly customerName?: unknown;

  @ApiPropertyOptional({ example: '2026-10-25' })
  @Allow()
  readonly issuedAt?: unknown;

  @ApiPropertyOptional({ example: LINES_EXAMPLE })
  @Allow()
  readonly lines?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly subtotal?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly igv?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly total?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly status?: unknown;
}

export class QuoteBodyDto extends DocumentBodyDto {
  @ApiPropertyOptional({ example: '2026-11-09' })
  @Allow()
  readonly validUntil?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly seller?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly notes?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly saleNumber?: unknown;
}

export class SaleBodyDto extends DocumentBodyDto {
  @ApiPropertyOptional()
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseName?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly quoteId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly quoteNumber?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly seller?: unknown;

  @ApiPropertyOptional({ enum: PAYMENT_TERMS })
  @Allow()
  readonly paymentTerm?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly invoiceId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly invoiceNumber?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly notes?: unknown;
}

export class InvoiceBodyDto extends DocumentBodyDto {
  @ApiPropertyOptional({ enum: INVOICE_KINDS })
  @Allow()
  readonly kind?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly saleId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly saleNumber?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly customerDocument?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly dueAt?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly creditedAmount?: unknown;
}

export class CreditNoteBodyDto extends DocumentBodyDto {
  @ApiPropertyOptional()
  @Allow()
  readonly invoiceId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly invoiceNumber?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseId?: unknown;

  @ApiPropertyOptional({ readOnly: true })
  @Allow()
  readonly warehouseName?: unknown;

  @ApiPropertyOptional({ enum: CREDIT_NOTE_REASONS })
  @Allow()
  readonly reason?: unknown;

  @ApiPropertyOptional()
  @Allow()
  readonly notes?: unknown;
}
