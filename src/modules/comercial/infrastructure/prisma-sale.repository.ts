import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { SaleEdit, SaleRecord, SaleStatus, SaleValues } from '../domain/commercial';
import type { SaleRepository, StatusFilter } from '../domain/ports/commercial-repositories.port';
import { LINES_SELECT, linesData, toLine, totalsData, totalsOfRow } from './commercial-columns';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const SALE_FIELDS = {
  id: true,
  number: true,
  customerId: true,
  customerName: true,
  warehouseId: true,
  warehouseName: true,
  quoteId: true,
  quoteNumber: true,
  issuedAt: true,
  seller: true,
  paymentTerm: true,
  subtotal: true,
  igv: true,
  total: true,
  status: true,
  invoiceId: true,
  invoiceNumber: true,
  notes: true,
  lines: LINES_SELECT,
} as const satisfies Prisma.SaleSelect;

type SaleRow = Prisma.SaleGetPayload<{ select: typeof SALE_FIELDS }>;

const toRecord = (row: SaleRow): SaleRecord => ({
  ...row,
  ...totalsOfRow(row),
  quoteId: row.quoteId ?? '',
  invoiceId: row.invoiceId ?? '',
  issuedAt: dayString(row.issuedAt),
  lines: row.lines.map(toLine),
});

const orNull = (id: string): string | null => (id === '' ? null : id);

@Injectable()
export class PrismaSaleRepository implements SaleRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(
    criteria: ListCriteria,
    filter: StatusFilter<SaleStatus>,
  ): Promise<ListResult<SaleRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.SaleWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { customerName: contains(criteria.q) },
              { quoteNumber: contains(criteria.q) },
              { invoiceNumber: contains(criteria.q) },
              { seller: contains(criteria.q) },
            ],
          }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.sale.count({ where });
    const rows = await this.host.client.sale.findMany({
      where,
      select: SALE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async find(id: string, forUpdate = false): Promise<SaleRecord | null> {
    if (forUpdate) {
      await this.host.client.$queryRaw`SELECT id FROM sales WHERE id = ${id} FOR UPDATE`;
    }
    const row = await this.host.client.sale.findUnique({ where: { id }, select: SALE_FIELDS });
    return row ? toRecord(row) : null;
  }

  async create(values: SaleValues): Promise<SaleRecord> {
    const row = await this.host.client.sale.create({
      data: {
        number: values.number,
        customerId: values.customerId,
        customerName: values.customerName,
        warehouseId: values.warehouseId,
        warehouseName: values.warehouseName,
        quoteId: orNull(values.quoteId),
        quoteNumber: values.quoteNumber,
        issuedAt: dayDate(values.issuedAt),
        seller: values.seller,
        paymentTerm: values.paymentTerm,
        ...totalsData(values),
        status: values.status,
        invoiceId: orNull(values.invoiceId),
        invoiceNumber: values.invoiceNumber,
        notes: values.notes,
        lines: { create: linesData(values.lines) },
      },
      select: SALE_FIELDS,
    });
    return toRecord(row);
  }

  async update(id: string, values: SaleEdit): Promise<SaleRecord> {
    const row = await this.host.client.sale.update({
      where: { id },
      data: { seller: values.seller, paymentTerm: values.paymentTerm, notes: values.notes },
      select: SALE_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: SaleStatus): Promise<SaleRecord> {
    const row = await this.host.client.sale.update({
      where: { id },
      data: { status },
      select: SALE_FIELDS,
    });
    return toRecord(row);
  }

  async setInvoice(
    id: string,
    invoice: { id: string; number: string } | null,
  ): Promise<SaleRecord> {
    const row = await this.host.client.sale.update({
      where: { id },
      data:
        invoice === null
          ? { invoiceId: null, invoiceNumber: '', status: 'pending_invoice' }
          : { invoiceId: invoice.id, invoiceNumber: invoice.number, status: 'invoiced' },
      select: SALE_FIELDS,
    });
    return toRecord(row);
  }
}
