import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import type { PayableFilter, PayableRecord, PayableValues } from '../domain/payable';
import type { PayableCriteria, PayableRepository } from '../domain/ports/purchasing.repositories';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';
import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';

const PAYABLE_FIELDS = {
  id: true,
  supplierInvoiceId: true,
  documentNumber: true,
  supplierId: true,
  supplierName: true,
  issuedAt: true,
  dueAt: true,
  amount: true,
  paidAmount: true,
  balance: true,
  status: true,
} as const satisfies Prisma.PayableSelect;

type PayableRow = Prisma.PayableGetPayload<{ select: typeof PAYABLE_FIELDS }>;

const toRecord = (row: PayableRow): PayableRecord => ({
  id: row.id,
  supplierInvoiceId: row.supplierInvoiceId,
  documentNumber: row.documentNumber,
  supplierId: row.supplierId,
  supplierName: row.supplierName,
  issuedAt: dayString(row.issuedAt),
  dueAt: dayString(row.dueAt),
  amount: moneyOf(row.amount),
  paidAmount: moneyOf(row.paidAmount),
  balance: moneyOf(row.balance),
  status: row.status,
});

/** `overdue` is not stored: an open payable whose due date already passed. */
function statusFilter(
  status: PayableFilter | undefined,
  today: string,
): Prisma.PayableWhereInput[] {
  if (status === undefined) {
    return [];
  }
  if (status === 'overdue') {
    return [{ status: { in: ['pending', 'partial'] } }, { dueAt: { lt: dayDate(today) } }];
  }
  return [{ status }];
}

@Injectable()
export class PrismaPayableRepository implements PayableRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: PayableCriteria): Promise<ListResult<PayableRecord>> {
    const dueAt = dayRange(criteria);
    const where: Prisma.PayableWhereInput = {
      AND: [
        ...(criteria.q === ''
          ? []
          : [
              {
                OR: [
                  { documentNumber: contains(criteria.q) },
                  { supplierName: contains(criteria.q) },
                ],
              },
            ]),
        ...statusFilter(criteria.status, criteria.today),
        ...(criteria.supplierId === undefined ? [] : [{ supplierId: criteria.supplierId }]),
        ...(dueAt === undefined ? [] : [{ dueAt }]),
      ],
    };
    const total = await this.host.client.payable.count({ where });
    const rows = await this.host.client.payable.findMany({
      where,
      select: PAYABLE_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<PayableRecord | null> {
    const row = await this.host.client.payable.findUnique({
      where: { id },
      select: PAYABLE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async findByInvoiceForUpdate(supplierInvoiceId: string): Promise<PayableRecord | null> {
    await this.host.client
      .$queryRaw`SELECT id FROM payables WHERE supplier_invoice_id = ${supplierInvoiceId} FOR UPDATE`;
    const row = await this.host.client.payable.findUnique({
      where: { supplierInvoiceId },
      select: PAYABLE_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async create(values: PayableValues): Promise<PayableRecord> {
    const row = await this.host.client.payable.create({
      data: {
        supplierInvoiceId: values.supplierInvoiceId,
        documentNumber: values.documentNumber,
        supplierId: values.supplierId,
        supplierName: values.supplierName,
        issuedAt: dayDate(values.issuedAt),
        dueAt: dayDate(values.dueAt),
        amount: values.amount.toDecimal(),
        paidAmount: values.paidAmount.toDecimal(),
        balance: values.balance.toDecimal(),
        status: values.status,
      },
      select: PAYABLE_FIELDS,
    });
    return toRecord(row);
  }

  async cancel(id: string): Promise<PayableRecord> {
    const row = await this.host.client.payable.update({
      where: { id },
      data: { balance: 0, status: 'cancelled' },
      select: PAYABLE_FIELDS,
    });
    return toRecord(row);
  }
}
