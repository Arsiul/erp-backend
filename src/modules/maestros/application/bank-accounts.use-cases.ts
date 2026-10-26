import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import type { ActingUser } from '../../../shared/application/listing/list-query';
import {
  BANK_ACCOUNT_IN_USE,
  type BankAccountInput,
  type BankAccountRecord,
  bankAccountChanges,
  bankAccountValues,
} from '../domain/bank-account';
import type { StatusFilter } from '../domain/ports/master.repository';
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepository,
} from '../domain/ports/bank-account.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

/**
 * Bank accounts of `/cuentas-bancarias`. The balance starts at the opening balance and from then
 * on only treasury movements change it.
 */
@Injectable()
export class BankAccountsUseCases extends MasterUseCases<
  BankAccountRecord,
  StatusFilter,
  MasterListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly repo: BankAccountRepository,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'cuentas-bancarias',
      inUse: BANK_ACCOUNT_IN_USE,
      reference: (record) => record.name,
    });
  }

  protected filters(input: MasterListInput): StatusFilter {
    return { status: input.status };
  }

  create(input: BankAccountInput, actor: ActingUser): Promise<BankAccountRecord> {
    return this.uow.run(async () => {
      const values = await bankAccountValues(input, this.repo);
      return this.created(actor, await this.repo.create(values));
    });
  }

  update(id: string, patch: BankAccountInput, actor: ActingUser): Promise<BankAccountRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const changes = await bankAccountChanges(current, patch, this.repo);
      return this.updated(actor, await this.repo.update(id, changes));
    });
  }
}
