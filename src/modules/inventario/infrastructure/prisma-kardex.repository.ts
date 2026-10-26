import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { KardexRecord } from '../domain/inventory';
import type { KardexCriteria, KardexRepository } from '../domain/ports/inventory.repositories';
import { dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const KARDEX_FIELDS = {
  id: true,
  date: true,
  productId: true,
  productName: true,
  sku: true,
  warehouseId: true,
  warehouseName: true,
  origin: true,
  reference: true,
  quantity: true,
  balance: true,
  unitCost: true,
} as const satisfies Prisma.KardexEntrySelect;

type KardexRow = Prisma.KardexEntryGetPayload<{ select: typeof KARDEX_FIELDS }>;

const toRecord = (row: KardexRow): KardexRecord => ({
  ...row,
  date: dayString(row.date),
  unitCost: moneyOf(row.unitCost),
});

@Injectable()
export class PrismaKardexRepository implements KardexRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: KardexCriteria): Promise<ListResult<KardexRecord>> {
    const date = dayRange(criteria);
    const where: Prisma.KardexEntryWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { sku: contains(criteria.q) },
              { productName: contains(criteria.q) },
              { warehouseName: contains(criteria.q) },
              { reference: contains(criteria.q) },
            ],
          }),
      ...(criteria.productId === undefined ? {} : { productId: criteria.productId }),
      ...(criteria.warehouseId === undefined ? {} : { warehouseId: criteria.warehouseId }),
      ...(criteria.origin === undefined ? {} : { origin: criteria.origin }),
      ...(date === undefined ? {} : { date }),
    };
    const total = await this.host.client.kardexEntry.count({ where });
    const rows = await this.host.client.kardexEntry.findMany({
      where,
      select: KARDEX_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<KardexRecord | null> {
    const row = await this.host.client.kardexEntry.findUnique({
      where: { id },
      select: KARDEX_FIELDS,
    });
    return row ? toRecord(row) : null;
  }
}
