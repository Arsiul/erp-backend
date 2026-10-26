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
  ACCOUNT_NUMBER_TAKEN,
  BANK_ACCOUNT_IN_USE,
  type BankAccountChanges,
  type BankAccountRecord,
  type BankAccountValues,
} from '../domain/bank-account';
import type { StatusFilter } from '../domain/ports/master.repository';
import type { BankAccountRepository } from '../domain/ports/bank-account.repository';
import { anyReference, except, sameValue, translateForeignKeyViolation } from './prisma-master';

const BANK_ACCOUNT_FIELDS = {
  id: true,
  bank: true,
  name: true,
  accountNumber: true,
  openingBalance: true,
  balance: true,
  status: true,
} as const satisfies Prisma.BankAccountSelect;

type BankAccountRow = Prisma.BankAccountGetPayload<{ select: typeof BANK_ACCOUNT_FIELDS }>;

const toRecord = (row: BankAccountRow): BankAccountRecord => ({
  ...row,
  openingBalance: row.openingBalance.toNumber(),
  balance: row.balance.toNumber(),
});

@Injectable()
export class PrismaBankAccountRepository implements BankAccountRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & StatusFilter): Promise<ListResult<BankAccountRecord>> {
    const createdAt = dateRange(criteria);
    const where: Prisma.BankAccountWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { bank: contains(criteria.q) },
              { name: contains(criteria.q) },
              { accountNumber: contains(criteria.q) },
            ],
          }),
      ...(criteria.status === undefined ? {} : { status: criteria.status }),
      ...(createdAt === undefined ? {} : { createdAt }),
    };
    const total = await this.host.client.bankAccount.count({ where });
    const rows = await this.host.client.bankAccount.findMany({
      where,
      select: BANK_ACCOUNT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<BankAccountRecord | null> {
    const row = await this.host.client.bankAccount.findUnique({
      where: { id },
      select: BANK_ACCOUNT_FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async isAccountNumberTaken(accountNumber: string, exceptId?: string): Promise<boolean> {
    const count = await this.host.client.bankAccount.count({
      where: { accountNumber: sameValue(accountNumber), ...except(exceptId) },
    });
    return count > 0;
  }

  create(values: BankAccountValues): Promise<BankAccountRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.bankAccount.create({
        data: values,
        select: BANK_ACCOUNT_FIELDS,
      });
      return toRecord(row);
    }, ACCOUNT_NUMBER_TAKEN);
  }

  /** The balances are never edited here: only treasury movements change them. */
  update(id: string, changes: BankAccountChanges): Promise<BankAccountRecord> {
    return translateUniqueViolation(async () => {
      const row = await this.host.client.bankAccount.update({
        where: { id },
        data: {
          bank: changes.bank,
          name: changes.name,
          accountNumber: changes.accountNumber,
          status: changes.status,
        },
        select: BANK_ACCOUNT_FIELDS,
      });
      return toRecord(row);
    }, ACCOUNT_NUMBER_TAKEN);
  }

  async setStatus(id: string, status: ActiveStatus): Promise<BankAccountRecord> {
    const row = await this.host.client.bankAccount.update({
      where: { id },
      data: { status },
      select: BANK_ACCOUNT_FIELDS,
    });
    return toRecord(row);
  }

  async isInUse(id: string): Promise<boolean> {
    const row = await this.host.client.bankAccount.findUnique({
      where: { id },
      select: { _count: { select: { movements: true } } },
    });
    return anyReference(row?._count);
  }

  async remove(id: string): Promise<void> {
    await translateForeignKeyViolation(
      () => this.host.client.bankAccount.delete({ where: { id } }),
      BANK_ACCOUNT_IN_USE,
    );
  }
}
