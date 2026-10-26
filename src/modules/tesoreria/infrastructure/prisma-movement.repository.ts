import { moneyOf } from '../../../shared/infrastructure/prisma/decimal-columns';
import { Injectable } from '@nestjs/common';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { contains, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { Prisma } from '../../../generated/prisma/client';
import type { MovementCriteria, MovementRepository } from '../domain/ports/treasury.ports';
import type { MovementRecord, MovementStatus, MovementValues } from '../domain/treasury';
import { dayDate, dayRange, dayString } from '../../../shared/infrastructure/prisma/day-range';

const MOVEMENT_FIELDS = {
  id: true,
  number: true,
  date: true,
  accountId: true,
  accountName: true,
  type: true,
  concept: true,
  receivableId: true,
  payableId: true,
  counterparty: true,
  reference: true,
  method: true,
  amount: true,
  status: true,
  notes: true,
} as const satisfies Prisma.CashMovementSelect;

type MovementRow = Prisma.CashMovementGetPayload<{ select: typeof MOVEMENT_FIELDS }>;

const toRecord = (row: MovementRow): MovementRecord => ({
  ...row,
  date: dayString(row.date),
  amount: moneyOf(row.amount),
});

@Injectable()
export class PrismaMovementRepository implements MovementRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: MovementCriteria): Promise<ListResult<MovementRecord>> {
    const date = dayRange(criteria);
    const where: Prisma.CashMovementWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { number: contains(criteria.q) },
              { accountName: contains(criteria.q) },
              { counterparty: contains(criteria.q) },
              { reference: contains(criteria.q) },
            ],
          }),
      ...(criteria.accountId === undefined ? {} : { accountId: criteria.accountId }),
      ...(criteria.type === undefined ? {} : { type: criteria.type }),
      ...(criteria.concept === undefined ? {} : { concept: criteria.concept }),
      ...(criteria.method === undefined ? {} : { method: criteria.method }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(date === undefined ? {} : { date }),
    };
    const total = await this.host.client.cashMovement.count({ where });
    const rows = await this.host.client.cashMovement.findMany({
      where,
      select: MOVEMENT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<MovementRecord | null> {
    const row = await this.host.client.cashMovement.findUnique({
      where: { id },
      select: MOVEMENT_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async lockById(id: string): Promise<MovementRecord | null> {
    await this.host.client.$queryRaw`SELECT id FROM cash_movements WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async create(number: string, values: MovementValues): Promise<MovementRecord> {
    const row = await this.host.client.cashMovement.create({
      data: {
        ...values,
        number,
        date: dayDate(values.date),
        amount: values.amount.toDecimal(),
      },
      select: MOVEMENT_FIELDS,
    });
    return toRecord(row);
  }

  async setNotes(id: string, notes: string): Promise<MovementRecord> {
    const row = await this.host.client.cashMovement.update({
      where: { id },
      data: { notes },
      select: MOVEMENT_FIELDS,
    });
    return toRecord(row);
  }

  async setStatus(id: string, status: MovementStatus): Promise<MovementRecord> {
    const row = await this.host.client.cashMovement.update({
      where: { id },
      data: { status },
      select: MOVEMENT_FIELDS,
    });
    return toRecord(row);
  }
}
