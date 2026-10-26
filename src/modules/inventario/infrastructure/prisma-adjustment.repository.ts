import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { AdjustmentRecord, AdjustmentValues } from '../domain/inventory';
import type {
  AdjustmentCriteria,
  AdjustmentRepository,
} from '../domain/ports/inventory.repositories';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const ADJUSTMENT_FIELDS = {
  id: true,
  number: true,
  date: true,
  productId: true,
  productName: true,
  sku: true,
  warehouseId: true,
  warehouseName: true,
  type: true,
  quantity: true,
  reason: true,
  notes: true,
} as const satisfies Prisma.StockAdjustmentSelect;

type AdjustmentRow = Prisma.StockAdjustmentGetPayload<{ select: typeof ADJUSTMENT_FIELDS }>;

const toRecord = (row: AdjustmentRow): AdjustmentRecord => ({ ...row, date: dayString(row.date) });

@Injectable()
export class PrismaAdjustmentRepository implements AdjustmentRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: AdjustmentCriteria): Promise<ListResult<AdjustmentRecord>> {
    const date = dayRange(criteria);
    const where: Prisma.StockAdjustmentWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { sku: contains(criteria.q) },
              { productName: contains(criteria.q) },
              { warehouseName: contains(criteria.q) },
            ],
          }),
      ...(criteria.productId === undefined ? {} : { productId: criteria.productId }),
      ...(criteria.warehouseId === undefined ? {} : { warehouseId: criteria.warehouseId }),
      ...(criteria.type === undefined ? {} : { type: criteria.type }),
      ...(criteria.reason === undefined ? {} : { reason: criteria.reason }),
      ...(date === undefined ? {} : { date }),
    };
    const total = await this.host.client.stockAdjustment.count({ where });
    const rows = await this.host.client.stockAdjustment.findMany({
      where,
      select: ADJUSTMENT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<AdjustmentRecord | null> {
    const row = await this.host.client.stockAdjustment.findUnique({
      where: { id },
      select: ADJUSTMENT_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async create(values: AdjustmentValues): Promise<AdjustmentRecord> {
    const row = await this.host.client.stockAdjustment.create({
      data: { ...values, date: dayDate(values.date) },
      select: ADJUSTMENT_FIELDS,
    });
    return toRecord(row);
  }
}
