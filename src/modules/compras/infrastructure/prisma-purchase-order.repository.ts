import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PurchaseOrderCriteria,
  PurchaseOrderRepository,
} from '../domain/ports/purchasing.repositories';
import type {
  PurchaseLine,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  PurchaseOrderValues,
} from '../domain/purchase-order';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';
import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';

const ORDER_FIELDS = {
  id: true,
  number: true,
  supplierId: true,
  supplierName: true,
  warehouseId: true,
  warehouseName: true,
  issuedAt: true,
  expectedAt: true,
  subtotal: true,
  igv: true,
  total: true,
  status: true,
  notes: true,
  lines: {
    select: {
      productId: true,
      productName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      receivedQuantity: true,
    },
    orderBy: { position: 'asc' },
  },
} as const satisfies Prisma.PurchaseOrderSelect;

type OrderRow = Prisma.PurchaseOrderGetPayload<{ select: typeof ORDER_FIELDS }>;

const toRecord = (row: OrderRow): PurchaseOrderRecord => ({
  id: row.id,
  number: row.number,
  supplierId: row.supplierId,
  supplierName: row.supplierName,
  warehouseId: row.warehouseId,
  warehouseName: row.warehouseName,
  issuedAt: dayString(row.issuedAt),
  expectedAt: dayString(row.expectedAt),
  lines: row.lines.map((line) => ({ ...line, unitPrice: moneyOf(line.unitPrice) })),
  subtotal: moneyOf(row.subtotal),
  igv: moneyOf(row.igv),
  total: moneyOf(row.total),
  status: row.status,
  notes: row.notes,
});

const header = (values: PurchaseOrderValues) => ({
  supplierId: values.supplierId,
  supplierName: values.supplierName,
  warehouseId: values.warehouseId,
  warehouseName: values.warehouseName,
  issuedAt: dayDate(values.issuedAt),
  expectedAt: dayDate(values.expectedAt),
  subtotal: values.subtotal.toDecimal(),
  igv: values.igv.toDecimal(),
  total: values.total.toDecimal(),
  notes: values.notes,
});

const lineRows = (values: PurchaseOrderValues) =>
  values.lines.map((line, index) => ({
    position: index + 1,
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toDecimal(),
  }));

@Injectable()
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: PurchaseOrderCriteria): Promise<ListResult<PurchaseOrderRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { supplierName: contains(criteria.q) },
              { warehouseName: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.supplierId === undefined ? {} : { supplierId: criteria.supplierId }),
      ...(criteria.warehouseId === undefined ? {} : { warehouseId: criteria.warehouseId }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.purchaseOrder.count({ where });
    const rows = await this.host.client.purchaseOrder.findMany({
      where,
      select: ORDER_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<PurchaseOrderRecord | null> {
    const row = await this.host.client.purchaseOrder.findUnique({
      where: { id },
      select: ORDER_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async findForUpdate(id: string): Promise<PurchaseOrderRecord | null> {
    await this.host.client.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async create(number: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord> {
    const row = await this.host.client.purchaseOrder.create({
      data: { number, ...header(values), status: 'draft', lines: { create: lineRows(values) } },
      select: ORDER_FIELDS,
    });
    return toRecord(row);
  }

  async update(id: string, values: PurchaseOrderValues): Promise<PurchaseOrderRecord> {
    await this.host.client.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    const row = await this.host.client.purchaseOrder.update({
      where: { id },
      data: { ...header(values), lines: { create: lineRows(values) } },
      select: ORDER_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrderRecord> {
    const row = await this.host.client.purchaseOrder.update({
      where: { id },
      data: { status },
      select: ORDER_FIELDS,
    });
    return toRecord(row);
  }

  async setProgress(
    id: string,
    lines: readonly PurchaseLine[],
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderRecord> {
    for (const line of lines) {
      await this.host.client.purchaseOrderLine.update({
        where: { purchaseOrderId_productId: { purchaseOrderId: id, productId: line.productId } },
        data: { receivedQuantity: line.receivedQuantity },
      });
    }
    return this.setStatus(id, status);
  }

  async remove(id: string): Promise<void> {
    await this.host.client.purchaseOrder.delete({ where: { id } });
  }
}
