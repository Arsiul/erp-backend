import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import {
  OVERDUE,
  type QuoteFilter,
  type QuoteRecord,
  type QuoteStatus,
  type QuoteValues,
} from '../domain/commercial';
import type { QuoteRepository, StatusFilter } from '../domain/ports/commercial-repositories.port';
import { LINES_SELECT, linesData, toLine, totalsData, totalsOfRow } from './commercial-columns';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const QUOTE_FIELDS = {
  id: true,
  number: true,
  customerId: true,
  customerName: true,
  issuedAt: true,
  validUntil: true,
  seller: true,
  subtotal: true,
  igv: true,
  total: true,
  status: true,
  saleNumber: true,
  notes: true,
  lines: LINES_SELECT,
} as const satisfies Prisma.QuoteSelect;

type QuoteRow = Prisma.QuoteGetPayload<{ select: typeof QUOTE_FIELDS }>;

const toRecord = (row: QuoteRow): QuoteRecord => ({
  ...row,
  ...totalsOfRow(row),
  issuedAt: dayString(row.issuedAt),
  validUntil: dayString(row.validUntil),
  lines: row.lines.map(toLine),
});

const toData = (values: QuoteValues) => ({
  number: values.number,
  customerId: values.customerId,
  customerName: values.customerName,
  issuedAt: dayDate(values.issuedAt),
  validUntil: dayDate(values.validUntil),
  seller: values.seller,
  ...totalsData(values),
  status: values.status,
  saleNumber: values.saleNumber,
  notes: values.notes,
});

function statusWhere(filter: StatusFilter<QuoteFilter>): Prisma.QuoteWhereInput {
  if (filter.status === undefined) {
    return {};
  }
  if (filter.status === OVERDUE) {
    return { status: { in: ['draft', 'sent'] }, validUntil: { lt: dayDate(filter.today) } };
  }
  return { status: filter.status };
}

@Injectable()
export class PrismaQuoteRepository implements QuoteRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(
    criteria: ListCriteria,
    filter: StatusFilter<QuoteFilter>,
  ): Promise<ListResult<QuoteRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.QuoteWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { customerName: contains(criteria.q) },
              { seller: contains(criteria.q) },
              { saleNumber: contains(criteria.q) },
            ],
          }),
      ...statusWhere(filter),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.quote.count({ where });
    const rows = await this.host.client.quote.findMany({
      where,
      select: QUOTE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async find(id: string, forUpdate = false): Promise<QuoteRecord | null> {
    if (forUpdate) {
      await this.host.client.$queryRaw`SELECT id FROM quotes WHERE id = ${id} FOR UPDATE`;
    }
    const row = await this.host.client.quote.findUnique({ where: { id }, select: QUOTE_FIELDS });
    return row ? toRecord(row) : null;
  }

  async create(values: QuoteValues): Promise<QuoteRecord> {
    const row = await this.host.client.quote.create({
      data: { ...toData(values), lines: { create: linesData(values.lines) } },
      select: QUOTE_FIELDS,
    });
    return toRecord(row);
  }

  async update(id: string, values: QuoteValues): Promise<QuoteRecord> {
    await this.host.client.quoteLine.deleteMany({ where: { quoteId: id } });
    const row = await this.host.client.quote.update({
      where: { id },
      data: { ...toData(values), lines: { create: linesData(values.lines) } },
      select: QUOTE_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: QuoteStatus, saleNumber?: string): Promise<QuoteRecord> {
    const row = await this.host.client.quote.update({
      where: { id },
      data: { status, ...(saleNumber === undefined ? {} : { saleNumber }) },
      select: QUOTE_FIELDS,
    });
    return toRecord(row);
  }

  async remove(id: string): Promise<void> {
    await this.host.client.quote.delete({ where: { id } });
  }
}
