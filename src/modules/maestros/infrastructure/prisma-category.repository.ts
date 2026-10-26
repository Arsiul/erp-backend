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
  CATEGORY_IN_USE,
  CATEGORY_NAME_TAKEN,
  type CategoryRecord,
  type CategoryValues,
} from '../domain/category';
import type { StatusFilter } from '../domain/ports/master.repository';
import type { CategoryRepository } from '../domain/ports/category.repository';
import { anyReference, except, sameValue, translateForeignKeyViolation } from './prisma-master';

const CATEGORY_FIELDS = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
} as const satisfies Prisma.CategorySelect;

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & StatusFilter): Promise<ListResult<CategoryRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.CategoryWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { code: contains(criteria.q) },
              { name: contains(criteria.q) },
              { description: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.category.count({ where });
    const items = await this.host.client.category.findMany({
      where,
      select: CATEGORY_FIELDS,
      ...listWindow(criteria),
    });
    return { items, total };
  }

  findById(id: string): Promise<CategoryRecord | null> {
    return this.host.client.category.findUnique({ where: { id }, select: CATEGORY_FIELDS });
  }

  async isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.category.count({
      where: { name: sameValue(name), ...except(exceptId) },
    });
    return count > 0;
  }

  create(code: string, values: CategoryValues): Promise<CategoryRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.category.create({ data: { code, ...values }, select: CATEGORY_FIELDS }),
      CATEGORY_NAME_TAKEN,
    );
  }

  update(id: string, values: CategoryValues): Promise<CategoryRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.category.update({ where: { id }, data: values, select: CATEGORY_FIELDS }),
      CATEGORY_NAME_TAKEN,
    );
  }

  setStatus(id: string, status: ActiveStatus): Promise<CategoryRecord> {
    return this.host.client.category.update({
      where: { id },
      data: { status },
      select: CATEGORY_FIELDS,
    });
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.category.findUnique({
      where: { id },
      select: { _count: { select: { products: true } } },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.category.delete({ where: { id } }),
      CATEGORY_IN_USE,
    );
  }
}
