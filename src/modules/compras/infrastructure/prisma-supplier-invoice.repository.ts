import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import {
  contains,
  listWindow,
  translateUniqueViolation,
} from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  SupplierInvoiceCriteria,
  SupplierInvoiceRepository,
} from '../domain/ports/purchasing.repositories';
import type { SupplierInvoiceRecord, SupplierInvoiceValues } from '../domain/supplier-invoice';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';
import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';

const INVOICE_FIELDS = {
  id: true,
  documentNumber: true,
  supplierId: true,
  supplierName: true,
  receiptId: true,
  receiptNumber: true,
  issuedAt: true,
  dueAt: true,
  subtotal: true,
  igv: true,
  total: true,
  status: true,
} as const satisfies Prisma.SupplierInvoiceSelect;

type InvoiceRow = Prisma.SupplierInvoiceGetPayload<{ select: typeof INVOICE_FIELDS }>;

const toRecord = (row: InvoiceRow): SupplierInvoiceRecord => ({
  id: row.id,
  documentNumber: row.documentNumber,
  supplierId: row.supplierId,
  supplierName: row.supplierName,
  receiptId: row.receiptId,
  receiptNumber: row.receiptNumber,
  issuedAt: dayString(row.issuedAt),
  dueAt: dayString(row.dueAt),
  subtotal: moneyOf(row.subtotal),
  igv: moneyOf(row.igv),
  total: moneyOf(row.total),
  status: row.status,
});

@Injectable()
export class PrismaSupplierInvoiceRepository implements SupplierInvoiceRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: SupplierInvoiceCriteria): Promise<ListResult<SupplierInvoiceRecord>> {
    const issuedAt = dayRange(criteria);
    const where: Prisma.SupplierInvoiceWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { documentNumber: contains(criteria.q) },
              { supplierName: contains(criteria.q) },
              { receiptNumber: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(criteria.supplierId === undefined ? {} : { supplierId: criteria.supplierId }),
      ...(criteria.receiptId === undefined ? {} : { receiptId: criteria.receiptId }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
    const total = await this.host.client.supplierInvoice.count({ where });
    const rows = await this.host.client.supplierInvoice.findMany({
      where,
      select: INVOICE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<SupplierInvoiceRecord | null> {
    const row = await this.host.client.supplierInvoice.findUnique({
      where: { id },
      select: INVOICE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async findForUpdate(id: string): Promise<SupplierInvoiceRecord | null> {
    await this.host.client.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async existsActive(supplierId: string, documentNumber: string): Promise<boolean> {
    const count = await this.host.client.supplierInvoice.count({
      where: { supplierId, documentNumber, status: { not: 'cancelled' } },
    });
    return count > 0;
  }

  async create(values: SupplierInvoiceValues): Promise<SupplierInvoiceRecord> {
    const row = await translateUniqueViolation(
      () =>
        this.host.client.supplierInvoice.create({
          data: {
            documentNumber: values.documentNumber,
            supplierId: values.supplierId,
            supplierName: values.supplierName,
            receiptId: values.receiptId,
            receiptNumber: values.receiptNumber,
            issuedAt: dayDate(values.issuedAt),
            dueAt: dayDate(values.dueAt),
            subtotal: values.subtotal.toDecimal(),
            igv: values.igv.toDecimal(),
            total: values.total.toDecimal(),
            status: 'registered',
          },
          select: INVOICE_FIELDS,
        }),
      `Ya registraste la factura ${values.documentNumber} de ${values.supplierName}.`,
    );
    return toRecord(row);
  }

  async cancel(id: string): Promise<SupplierInvoiceRecord> {
    const row = await this.host.client.supplierInvoice.update({
      where: { id },
      data: { status: 'cancelled' },
      select: INVOICE_FIELDS,
    });
    return toRecord(row);
  }
}
