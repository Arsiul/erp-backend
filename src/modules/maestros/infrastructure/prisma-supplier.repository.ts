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
  SUPPLIER_IN_USE,
  SUPPLIER_RUC_TAKEN,
  type SupplierRecord,
  type SupplierValues,
} from '../domain/supplier';
import type { StatusFilter } from '../domain/ports/master.repository';
import type { SupplierRepository } from '../domain/ports/supplier.repository';
import { anyReference, except, translateForeignKeyViolation } from './prisma-master';

const SUPPLIER_FIELDS = {
  id: true,
  code: true,
  name: true,
  ruc: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  paymentDays: true,
  status: true,
} as const satisfies Prisma.SupplierSelect;

@Injectable()
export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & StatusFilter): Promise<ListResult<SupplierRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.SupplierWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { code: contains(criteria.q) },
              { name: contains(criteria.q) },
              { ruc: contains(criteria.q) },
              { contactName: contains(criteria.q) },
              { email: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.supplier.count({ where });
    const items = await this.host.client.supplier.findMany({
      where,
      select: SUPPLIER_FIELDS,
      ...listWindow(criteria),
    });
    return { items, total };
  }

  findById(id: string): Promise<SupplierRecord | null> {
    return this.host.client.supplier.findUnique({ where: { id }, select: SUPPLIER_FIELDS });
  }

  async isRucTaken(ruc: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.supplier.count({
      where: { ruc: ruc.trim(), ...except(exceptId) },
    });
    return count > 0;
  }

  create(code: string, values: SupplierValues): Promise<SupplierRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.supplier.create({ data: { code, ...values }, select: SUPPLIER_FIELDS }),
      SUPPLIER_RUC_TAKEN,
    );
  }

  update(id: string, values: SupplierValues): Promise<SupplierRecord> {
    return translateUniqueViolation(
      () =>
        this.host.client.supplier.update({ where: { id }, data: values, select: SUPPLIER_FIELDS }),
      SUPPLIER_RUC_TAKEN,
    );
  }

  setStatus(id: string, status: ActiveStatus): Promise<SupplierRecord> {
    return this.host.client.supplier.update({
      where: { id },
      data: { status },
      select: SUPPLIER_FIELDS,
    });
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.supplier.findUnique({
      where: { id },
      select: {
        _count: {
          select: { purchaseOrders: true, receipts: true, supplierInvoices: true, payables: true },
        },
      },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.supplier.delete({ where: { id } }),
      SUPPLIER_IN_USE,
    );
  }
}
