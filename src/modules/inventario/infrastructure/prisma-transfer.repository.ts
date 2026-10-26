import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { TransferRecord, TransferStatus, TransferValues } from '../domain/inventory';
import type { TransferCriteria, TransferRepository } from '../domain/ports/inventory.repositories';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const TRANSFER_FIELDS = {
  id: true,
  number: true,
  date: true,
  productId: true,
  productName: true,
  sku: true,
  originWarehouseId: true,
  originWarehouseName: true,
  destinationWarehouseId: true,
  destinationWarehouseName: true,
  quantity: true,
  status: true,
  notes: true,
} as const satisfies Prisma.TransferSelect;

type TransferRow = Prisma.TransferGetPayload<{ select: typeof TRANSFER_FIELDS }>;

const toRecord = (row: TransferRow): TransferRecord => ({ ...row, date: dayString(row.date) });

const toData = (values: TransferValues) => ({ ...values, date: dayDate(values.date) });

@Injectable()
export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: TransferCriteria): Promise<ListResult<TransferRecord>> {
    const date = dayRange(criteria);
    const filters: Prisma.TransferWhereInput[] = [];
    if (criteria.q !== '') {
      filters.push({
        OR: [
          { number: contains(criteria.q) },
          { sku: contains(criteria.q) },
          { productName: contains(criteria.q) },
          { originWarehouseName: contains(criteria.q) },
          { destinationWarehouseName: contains(criteria.q) },
        ],
      });
    }
    if (criteria.warehouseId !== undefined) {
      filters.push({
        OR: [
          { originWarehouseId: criteria.warehouseId },
          { destinationWarehouseId: criteria.warehouseId },
        ],
      });
    }
    const where: Prisma.TransferWhereInput = {
      AND: filters,
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.productId === undefined ? {} : { productId: criteria.productId }),
      ...(date === undefined ? {} : { date }),
    };
    const total = await this.host.client.transfer.count({ where });
    const rows = await this.host.client.transfer.findMany({
      where,
      select: TRANSFER_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<TransferRecord | null> {
    const row = await this.host.client.transfer.findUnique({
      where: { id },
      select: TRANSFER_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async lockById(id: string): Promise<TransferRecord | null> {
    await this.host.client.$queryRaw`SELECT id FROM transfers WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async create(number: string, values: TransferValues): Promise<TransferRecord> {
    const row = await this.host.client.transfer.create({
      data: { ...toData(values), number },
      select: TRANSFER_FIELDS,
    });
    return toRecord(row);
  }

  async update(id: string, values: TransferValues): Promise<TransferRecord> {
    const row = await this.host.client.transfer.update({
      where: { id },
      data: toData(values),
      select: TRANSFER_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: TransferStatus): Promise<TransferRecord> {
    const row = await this.host.client.transfer.update({
      where: { id },
      data: { status },
      select: TRANSFER_FIELDS,
    });
    return toRecord(row);
  }
}
