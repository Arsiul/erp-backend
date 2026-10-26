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
import { formatCode } from '../../../shared/domain/numbering/document-number';
import {
  SUPPLIER_CODE,
  SUPPLIER_IN_USE,
  type SupplierInput,
  type SupplierRecord,
  supplierValues,
} from '../domain/supplier';
import type { StatusFilter } from '../domain/ports/master.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../domain/ports/supplier.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

/** Suppliers of `/proveedores`; the code `PRV-0001` comes from a sequence. */
@Injectable()
export class SuppliersUseCases extends MasterUseCases<
  SupplierRecord,
  StatusFilter,
  MasterListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(SUPPLIER_REPOSITORY) private readonly repo: SupplierRepository,
    @Inject(SEQUENCE_GENERATOR) private readonly sequence: SequenceGenerator,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'proveedores',
      inUse: SUPPLIER_IN_USE,
      reference: (record) => record.code,
    });
  }

  protected filters(input: MasterListInput): StatusFilter {
    return { status: input.status };
  }

  create(input: SupplierInput, actor: ActingUser): Promise<SupplierRecord> {
    return this.uow.run(async () => {
      const values = await supplierValues(input, this.repo);
      const code = formatCode(
        SUPPLIER_CODE.prefix,
        await this.sequence.next(SUPPLIER_CODE.key),
        SUPPLIER_CODE.digits,
      );
      return this.created(actor, await this.repo.create(code, values));
    });
  }

  update(id: string, patch: SupplierInput, actor: ActingUser): Promise<SupplierRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const values = await supplierValues(
        mergeDefined<SupplierInput>(current, patch),
        this.repo,
        id,
      );
      return this.updated(actor, await this.repo.update(id, values));
    });
  }
}
