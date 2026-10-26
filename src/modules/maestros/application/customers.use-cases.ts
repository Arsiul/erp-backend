import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { type ActingUser, mergeDefined } from '../../../shared/application/listing/list-query';
import { type CustomerDocumentType } from '../domain/master-fields';
import { formatCode } from '../../../shared/domain/numbering/document-number';
import {
  CUSTOMER_CODE,
  CUSTOMER_IN_USE,
  type CustomerInput,
  type CustomerRecord,
  customerValues,
} from '../domain/customer';
import {
  CUSTOMER_REPOSITORY,
  type CustomerFilter,
  type CustomerRepository,
} from '../domain/ports/customer.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

export interface CustomerListInput extends MasterListInput {
  readonly documentType?: CustomerDocumentType | undefined;
}

/** Customers of `/clientes`; the code `CLI-0001` comes from a sequence. */
@Injectable()
export class CustomersUseCases extends MasterUseCases<
  CustomerRecord,
  CustomerFilter,
  CustomerListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: CustomerRepository,
    @Inject(SEQUENCE_GENERATOR) private readonly sequence: SequenceGenerator,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'clientes',
      inUse: CUSTOMER_IN_USE,
      reference: (record) => record.documentNumber,
    });
  }

  protected filters(input: CustomerListInput): CustomerFilter {
    return { status: input.status, documentType: input.documentType };
  }

  create(input: CustomerInput, actor: ActingUser): Promise<CustomerRecord> {
    return this.uow.run(async () => {
      const values = await customerValues(input, this.repo);
      const code = formatCode(
        CUSTOMER_CODE.prefix,
        await this.sequence.next(CUSTOMER_CODE.key),
        CUSTOMER_CODE.digits,
      );
      return this.created(actor, await this.repo.create(code, values));
    });
  }

  update(id: string, patch: CustomerInput, actor: ActingUser): Promise<CustomerRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const merged = mergeDefined<CustomerInput>(current, patch);
      return this.updated(
        actor,
        await this.repo.update(id, await customerValues(merged, this.repo, id)),
      );
    });
  }
}
