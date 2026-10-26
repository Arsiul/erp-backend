import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { CreditNoteRecord, CreditNoteValues } from '../domain/commercial';
import type { CreditNoteRepository } from '../domain/ports/commercial-repositories.port';
import { LINES_SELECT, linesData, toLine, totalsData, totalsOfRow } from './commercial-columns';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const CREDIT_NOTE_FIELDS = {
  id: true,
  number: true,
  invoiceId: true,
  invoiceNumber: true,
  customerId: true,
  customerName: true,
  warehouseId: true,
  warehouseName: true,
  issuedAt: true,
  reason: true,
  subtotal: true,
  igv: true,
  total: true,
  notes: true,
  lines: LINES_SELECT,
} as const satisfies Prisma.CreditNoteSelect;

type CreditNoteRow = Prisma.CreditNoteGetPayload<{ select: typeof CREDIT_NOTE_FIELDS }>;

const toRecord = (row: CreditNoteRow): CreditNoteRecord => ({
  ...row,
  ...totalsOfRow(row),
  issuedAt: dayString(row.issuedAt),
  lines: row.lines.map(toLine),
});

@Injectable()
export class PrismaCreditNoteRepository implements CreditNoteRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria): Promise<ListResult<CreditNoteRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.CreditNoteWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { invoiceNumber: contains(criteria.q) },
              { customerName: contains(criteria.q) },
            ],
          }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.creditNote.count({ where });
    const rows = await this.host.client.creditNote.findMany({
      where,
      select: CREDIT_NOTE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async find(id: string): Promise<CreditNoteRecord | null> {
    const row = await this.host.client.creditNote.findUnique({
      where: { id },
      select: CREDIT_NOTE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async create(values: CreditNoteValues): Promise<CreditNoteRecord> {
    const row = await this.host.client.creditNote.create({
      data: {
        number: values.number,
        invoiceId: values.invoiceId,
        invoiceNumber: values.invoiceNumber,
        customerId: values.customerId,
        customerName: values.customerName,
        warehouseId: values.warehouseId,
        warehouseName: values.warehouseName,
        issuedAt: dayDate(values.issuedAt),
        reason: values.reason,
        ...totalsData(values),
        notes: values.notes,
        lines: { create: linesData(values.lines) },
      },
      select: CREDIT_NOTE_FIELDS,
    });
    return toRecord(row);
  }
}
