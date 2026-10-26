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
  CUSTOMER_DOCUMENT_TAKEN,
  CUSTOMER_IN_USE,
  type CustomerRecord,
  type CustomerValues,
} from '../domain/customer';
import type { CustomerFilter, CustomerRepository } from '../domain/ports/customer.repository';
import { anyReference, except, sameValue, translateForeignKeyViolation } from './prisma-master';

const CUSTOMER_FIELDS = {
  id: true,
  code: true,
  name: true,
  documentType: true,
  documentNumber: true,
  email: true,
  phone: true,
  address: true,
  creditDays: true,
  creditLimit: true,
  status: true,
} as const satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_FIELDS }>;

const toRecord = (row: CustomerRow): CustomerRecord => ({
  ...row,
  creditLimit: row.creditLimit.toNumber(),
});

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & CustomerFilter): Promise<ListResult<CustomerRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.CustomerWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { code: contains(criteria.q) },
              { name: contains(criteria.q) },
              { documentNumber: contains(criteria.q) },
              { email: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.documentType === undefined ? {} : { documentType: criteria.documentType }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.customer.count({ where });
    const rows = await this.host.client.customer.findMany({
      where,
      select: CUSTOMER_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<CustomerRecord | null> {
    const row = await this.host.client.customer.findUnique({
      where: { id },
      select: CUSTOMER_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async isDocumentTaken(documentNumber: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.customer.count({
      where: { documentNumber: sameValue(documentNumber), ...except(exceptId) },
    });
    return count > 0;
  }

  create(code: string, values: CustomerValues): Promise<CustomerRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.customer.create({
        data: { code, ...values },
        select: CUSTOMER_FIELDS,
      });
      return toRecord(row);
    }, CUSTOMER_DOCUMENT_TAKEN);
  }

  update(id: string, values: CustomerValues): Promise<CustomerRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.customer.update({
        where: { id },
        data: values,
        select: CUSTOMER_FIELDS,
      });
      return toRecord(row);
    }, CUSTOMER_DOCUMENT_TAKEN);
  }

  async setStatus(id: string, status: ActiveStatus): Promise<CustomerRecord> {
    const row = await this.host.client.customer.update({
      where: { id },
      data: { status },
      select: CUSTOMER_FIELDS,
    });
    return toRecord(row);
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.customer.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            quotes: true,
            sales: true,
            invoices: true,
            creditNotes: true,
            receivables: true,
          },
        },
      },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.customer.delete({ where: { id } }),
      CUSTOMER_IN_USE,
    );
  }
}
