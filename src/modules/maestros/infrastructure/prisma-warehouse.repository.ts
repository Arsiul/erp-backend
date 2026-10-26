import { Injectable } from '@nestjs/common';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import {
  contains,
  dateRange,
  listWindow,
  translateUniqueViolation,
} from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import {
  WAREHOUSE_IN_USE,
  WAREHOUSE_NAME_TAKEN,
  type WarehouseRecord,
  type WarehouseValues,
} from '../domain/warehouse';
import type { StatusFilter } from '../domain/ports/master.repository';
import type { WarehouseRepository } from '../domain/ports/warehouse.repository';
import { anyReference, except, sameValue, translateForeignKeyViolation } from './prisma-master';

const WAREHOUSE_FIELDS = {
  id: true,
  code: true,
  name: true,
  address: true,
  manager: true,
  status: true,
} as const satisfies Prisma.WarehouseSelect;

/** Stock rows are not a use: they are created with the warehouse and cascade on delete. */
const WAREHOUSE_USES = {
  kardex: true,
  sales: true,
  invoices: true,
  creditNotes: true,
  purchaseOrders: true,
  receipts: true,
  adjustments: true,
  outgoingTransfers: true,
  incomingTransfers: true,
} as const satisfies Prisma.WarehouseCountOutputTypeSelect;

@Injectable()
export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & StatusFilter): Promise<ListResult<WarehouseRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.WarehouseWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { code: contains(criteria.q) },
              { name: contains(criteria.q) },
              { address: contains(criteria.q) },
              { manager: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.warehouse.count({ where });
    const items = await this.host.client.warehouse.findMany({
      where,
      select: WAREHOUSE_FIELDS,
      ...listWindow(criteria),
    });
    return { items, total };
  }

  findById(id: string): Promise<WarehouseRecord | null> {
    return this.host.client.warehouse.findUnique({ where: { id }, select: WAREHOUSE_FIELDS });
  }

  async isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.warehouse.count({
      where: { name: sameValue(name), ...except(exceptId) },
    });
    return count > 0;
  }

  create(code: string, values: WarehouseValues): Promise<WarehouseRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.warehouse.create({ data: { code, ...values }, select: WAREHOUSE_FIELDS }),
      WAREHOUSE_NAME_TAKEN,
    );
  }

  update(id: string, values: WarehouseValues): Promise<WarehouseRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.warehouse.update({
          where: { id },
          data: values,
          select: WAREHOUSE_FIELDS,
        }),
      WAREHOUSE_NAME_TAKEN,
    );
  }

  setStatus(id: string, status: ActiveStatus): Promise<WarehouseRecord> {
    return this.host.client.warehouse.update({
      where: { id },
      data: { status },
      select: WAREHOUSE_FIELDS,
    });
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.warehouse.findUnique({
      where: { id },
      select: { _count: { select: WAREHOUSE_USES } },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.warehouse.delete({ where: { id } }),
      WAREHOUSE_IN_USE,
    );
  }
}
