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
  type CategoryReference,
  PRODUCT_IN_USE,
  PRODUCT_SKU_TAKEN,
  type ProductRecord,
  type ProductValues,
} from '../domain/product';
import type { ProductFilter, ProductRepository } from '../domain/ports/product.repository';
import { anyReference, except, translateForeignKeyViolation } from './prisma-master';

const PRODUCT_FIELDS = {
  id: true,
  sku: true,
  name: true,
  categoryId: true,
  unit: true,
  salePrice: true,
  costPrice: true,
  minStock: true,
  status: true,
  category: { select: { name: true } },
} as const satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_FIELDS }>;

/** Stock rows are not a use: they are created with the product and cascade on delete. */
const PRODUCT_USES = {
  kardex: true,
  quoteLines: true,
  saleLines: true,
  invoiceLines: true,
  creditNoteLines: true,
  purchaseOrderLines: true,
  receiptLines: true,
  adjustments: true,
  transfers: true,
} as const satisfies Prisma.ProductCountOutputTypeSelect;

const toRecord = ({ category, ...row }: ProductRow): ProductRecord => ({
  ...row,
  categoryName: category.name,
  salePrice: row.salePrice.toNumber(),
  costPrice: row.costPrice.toNumber(),
});

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & ProductFilter): Promise<ListResult<ProductRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.ProductWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { sku: contains(criteria.q) },
              { name: contains(criteria.q) },
              { category: { name: contains(criteria.q) } },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.categoryId === undefined ? {} : { categoryId: criteria.categoryId }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.product.count({ where });
    const rows = await this.host.client.product.findMany({
      where,
      select: PRODUCT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.host.client.product.findUnique({
      where: { id },
      select: PRODUCT_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async isSkuTaken(sku: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.product.count({
      where: { sku: sku.trim().toUpperCase(), ...except(exceptId) },
    });
    return count > 0;
  }

  findCategory(id: string): Promise<CategoryReference | null> {
    return this.host.client.category.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
  }

  create(values: ProductValues): Promise<ProductRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.product.create({
        data: values,
        select: PRODUCT_FIELDS,
      });
      return toRecord(row);
    }, PRODUCT_SKU_TAKEN);
  }

  update(id: string, values: ProductValues): Promise<ProductRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.product.update({
        where: { id },
        data: values,
        select: PRODUCT_FIELDS,
      });
      return toRecord(row);
    }, PRODUCT_SKU_TAKEN);
  }

  async syncMinStock(id: string, minStock: number): Promise<void> {
    await this.host.client.stockItem.updateMany({ where: { productId: id }, data: { minStock } });
  }

  async setStatus(id: string, status: ActiveStatus): Promise<ProductRecord> {
    const row = await this.host.client.product.update({
      where: { id },
      data: { status },
      select: PRODUCT_FIELDS,
    });
    return toRecord(row);
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.product.findUnique({
      where: { id },
      select: { _count: { select: PRODUCT_USES } },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.product.delete({ where: { id } }),
      PRODUCT_IN_USE,
    );
  }
}
