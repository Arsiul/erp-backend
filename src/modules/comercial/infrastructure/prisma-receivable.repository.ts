import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import {
  OVERDUE,
  type ReceivableBalance,
  type ReceivableFilter,
  type ReceivableRecord,
  type ReceivableValues,
} from '../domain/commercial';
import type {
  ReceivableListFilter,
  ReceivableRepository,
  StatusFilter,
} from '../domain/ports/commercial-repositories.port';
import { amountOf, decimalOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const RECEIVABLE_FIELDS = {
  id: true,
  invoiceId: true,
  documentNumber: true,
  customerId: true,
  customerName: true,
  issuedAt: true,
  dueAt: true,
  amount: true,
  paidAmount: true,
  creditedAmount: true,
  balance: true,
  status: true,
} as const satisfies Prisma.ReceivableSelect;

type ReceivableRow = Prisma.ReceivableGetPayload<{ select: typeof RECEIVABLE_FIELDS }>;

const toRecord = (row: ReceivableRow): ReceivableRecord => ({
  ...row,
  issuedAt: dayString(row.issuedAt),
  dueAt: dayString(row.dueAt),
  amount: amountOf(row.amount),
  paidAmount: amountOf(row.paidAmount),
  creditedAmount: amountOf(row.creditedAmount),
  balance: amountOf(row.balance),
});

function statusWhere(filter: StatusFilter<ReceivableFilter>): Prisma.ReceivableWhereInput {
  if (filter.status === undefined) {
    return {};
  }
  if (filter.status === OVERDUE) {
    return {
      status: { not: 'cancelled' },
      balance: { gt: 0 },
      dueAt: { lt: dayDate(filter.today) },
    };
  }
  return { status: filter.status };
}

@Injectable()
export class PrismaReceivableRepository implements ReceivableRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(
    criteria: ListCriteria,
    filter: ReceivableListFilter,
  ): Promise<ListResult<ReceivableRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.ReceivableWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [{ documentNumber: contains(criteria.q) }, { customerName: contains(criteria.q) }],
          }),
      ...statusWhere(filter),
      ...(filter.customerId === undefined ? {} : { customerId: filter.customerId }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.receivable.count({ where });
    const rows = await this.host.client.receivable.findMany({
      where,
      select: RECEIVABLE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async find(id: string): Promise<ReceivableRecord | null> {
    const row = await this.host.client.receivable.findUnique({
      where: { id },
      select: RECEIVABLE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async findByInvoice(invoiceId: string, forUpdate = false): Promise<ReceivableRecord | null> {
    if (forUpdate) {
      await this.host.client
        .$queryRaw`SELECT id FROM receivables WHERE invoice_id = ${invoiceId} FOR UPDATE`;
    }
    const row = await this.host.client.receivable.findUnique({
      where: { invoiceId },
      select: RECEIVABLE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async create(values: ReceivableValues): Promise<ReceivableRecord> {
    const row = await this.host.client.receivable.create({
      data: {
        invoiceId: values.invoiceId,
        documentNumber: values.documentNumber,
        customerId: values.customerId,
        customerName: values.customerName,
        issuedAt: dayDate(values.issuedAt),
        dueAt: dayDate(values.dueAt),
        amount: decimalOf(values.amount),
        paidAmount: decimalOf(values.paidAmount),
        creditedAmount: decimalOf(values.creditedAmount),
        balance: decimalOf(values.balance),
        status: values.status,
      },
      select: RECEIVABLE_FIELDS,
    });
    return toRecord(row);
  }

  async setBalance(id: string, values: ReceivableBalance): Promise<ReceivableRecord> {
    const row = await this.host.client.receivable.update({
      where: { id },
      data: {
        creditedAmount: decimalOf(values.creditedAmount),
        balance: decimalOf(values.balance),
        status: values.status,
      },
      select: RECEIVABLE_FIELDS,
    });
    return toRecord(row);
  }
}
