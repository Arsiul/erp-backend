import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { InvoiceRecord, InvoiceStatus, InvoiceValues } from '../domain/commercial';
import type { InvoiceRepository, StatusFilter } from '../domain/ports/commercial-repositories.port';
import { amountOf, decimalOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { LINES_SELECT, linesData, toLine, totalsData, totalsOfRow } from './commercial-columns';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const INVOICE_FIELDS = {
  id: true,
  kind: true,
  number: true,
  saleId: true,
  saleNumber: true,
  customerId: true,
  customerName: true,
  customerDocument: true,
  warehouseId: true,
  issuedAt: true,
  dueAt: true,
  subtotal: true,
  igv: true,
  total: true,
  creditedAmount: true,
  status: true,
  lines: LINES_SELECT,
} as const satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_FIELDS }>;

const toRecord = (row: InvoiceRow): InvoiceRecord => ({
  ...row,
  ...totalsOfRow(row),
  creditedAmount: amountOf(row.creditedAmount),
  issuedAt: dayString(row.issuedAt),
  dueAt: dayString(row.dueAt),
  lines: row.lines.map(toLine),
});

@Injectable()
export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(
    criteria: ListCriteria,
    filter: StatusFilter<InvoiceStatus>,
  ): Promise<ListResult<InvoiceRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.InvoiceWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { customerName: contains(criteria.q) },
              { customerDocument: contains(criteria.q) },
              { saleNumber: contains(criteria.q) },
            ],
          }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.invoice.count({ where });
    const rows = await this.host.client.invoice.findMany({
      where,
      select: INVOICE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async find(id: string, forUpdate = false): Promise<InvoiceRecord | null> {
    if (forUpdate) {
      await this.host.client.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
    }
    const row = await this.host.client.invoice.findUnique({
      where: { id },
      select: INVOICE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async create(values: InvoiceValues): Promise<InvoiceRecord> {
    const row = await this.host.client.invoice.create({
      data: {
        kind: values.kind,
        number: values.number,
        saleId: values.saleId,
        saleNumber: values.saleNumber,
        customerId: values.customerId,
        customerName: values.customerName,
        customerDocument: values.customerDocument,
        warehouseId: values.warehouseId,
        issuedAt: dayDate(values.issuedAt),
        dueAt: dayDate(values.dueAt),
        ...totalsData(values),
        creditedAmount: decimalOf(values.creditedAmount),
        status: values.status,
        lines: { create: linesData(values.lines) },
      },
      select: INVOICE_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: InvoiceStatus): Promise<InvoiceRecord> {
    const row = await this.host.client.invoice.update({
      where: { id },
      data: { status },
      select: INVOICE_FIELDS,
    });
    return toRecord(row);
  }

  async setCreditedAmount(id: string, creditedAmount: number): Promise<InvoiceRecord> {
    const row = await this.host.client.invoice.update({
      where: { id },
      data: { creditedAmount: decimalOf(creditedAmount) },
      select: INVOICE_FIELDS,
    });
    return toRecord(row);
  }
}
