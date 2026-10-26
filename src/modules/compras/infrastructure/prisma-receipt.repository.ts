import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import type { ReceiptCriteria, ReceiptRepository } from '../domain/ports/purchasing.repositories';
import type { ReceiptRecord, ReceiptStatus, ReceiptValues } from '../domain/receipt';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';
import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';

const RECEIPT_FIELDS = {
  id: true,
  number: true,
  purchaseOrderId: true,
  purchaseOrderNumber: true,
  supplierId: true,
  supplierName: true,
  warehouseId: true,
  warehouseName: true,
  receivedAt: true,
  guideNumber: true,
  subtotal: true,
  status: true,
  supplierInvoiceNumber: true,
  lines: {
    select: { productId: true, productName: true, sku: true, quantity: true, unitPrice: true },
    orderBy: { position: 'asc' },
  },
} as const satisfies Prisma.ReceiptSelect;

type ReceiptRow = Prisma.ReceiptGetPayload<{ select: typeof RECEIPT_FIELDS }>;

const toRecord = (row: ReceiptRow): ReceiptRecord => ({
  id: row.id,
  number: row.number,
  purchaseOrderId: row.purchaseOrderId,
  purchaseOrderNumber: row.purchaseOrderNumber,
  supplierId: row.supplierId,
  supplierName: row.supplierName,
  warehouseId: row.warehouseId,
  warehouseName: row.warehouseName,
  receivedAt: dayString(row.receivedAt),
  guideNumber: row.guideNumber,
  lines: row.lines.map((line) => ({ ...line, unitPrice: moneyOf(line.unitPrice) })),
  subtotal: moneyOf(row.subtotal),
  status: row.status,
  supplierInvoiceNumber: row.supplierInvoiceNumber,
});

@Injectable()
export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ReceiptCriteria): Promise<ListResult<ReceiptRecord>> {
    const receivedAt = dayRange(criteria);
    const where: Prisma.ReceiptWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { purchaseOrderNumber: contains(criteria.q) },
              { guideNumber: contains(criteria.q) },
              { supplierName: contains(criteria.q) },
              { supplierInvoiceNumber: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.purchaseOrderId === undefined
        ? {}
        : { purchaseOrderId: criteria.purchaseOrderId }),
      ...(criteria.supplierId === undefined ? {} : { supplierId: criteria.supplierId }),
      ...(receivedAt === undefined ? {} : { receivedAt }),
    };
    const total = await this.host.client.receipt.count({ where });
    const rows = await this.host.client.receipt.findMany({
      where,
      select: RECEIPT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<ReceiptRecord | null> {
    const row = await this.host.client.receipt.findUnique({
      where: { id },
      select: RECEIPT_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async findForUpdate(id: string): Promise<ReceiptRecord | null> {
    await this.host.client.$queryRaw`SELECT id FROM receipts WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async listByOrder(purchaseOrderId: string): Promise<readonly ReceiptRecord[]> {
    const rows = await this.host.client.receipt.findMany({
      where: { purchaseOrderId },
      select: RECEIPT_FIELDS,
      orderBy: { seq: 'asc' },
    });
    return rows.map(toRecord);
  }

  async create(number: string, values: ReceiptValues): Promise<ReceiptRecord> {
    const row = await this.host.client.receipt.create({
      data: {
        number,
        purchaseOrderId: values.purchaseOrderId,
        purchaseOrderNumber: values.purchaseOrderNumber,
        supplierId: values.supplierId,
        supplierName: values.supplierName,
        warehouseId: values.warehouseId,
        warehouseName: values.warehouseName,
        receivedAt: dayDate(values.receivedAt),
        guideNumber: values.guideNumber,
        subtotal: values.subtotal.toDecimal(),
        status: 'pending_bill',
        supplierInvoiceNumber: '',
        lines: {
          create: values.lines.map((line, index) => ({
            position: index + 1,
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toDecimal(),
          })),
        },
      },
      select: RECEIPT_FIELDS,
    });
    return toRecord(row);
  }

  async setGuideNumber(id: string, guideNumber: string): Promise<ReceiptRecord> {
    const row = await this.host.client.receipt.update({
      where: { id },
      data: { guideNumber },
      select: RECEIPT_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(
    id: string,
    status: ReceiptStatus,
    supplierInvoiceNumber: string,
  ): Promise<ReceiptRecord> {
    const row = await this.host.client.receipt.update({
      where: { id },
      data: { status, supplierInvoiceNumber },
      select: RECEIPT_FIELDS,
    });
    return toRecord(row);
  }
}
