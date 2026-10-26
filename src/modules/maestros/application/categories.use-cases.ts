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
  CATEGORY_CODE,
  CATEGORY_IN_USE,
  type CategoryInput,
  type CategoryRecord,
  categoryValues,
} from '../domain/category';
import type { StatusFilter } from '../domain/ports/master.repository';
import { CATEGORY_REPOSITORY, type CategoryRepository } from '../domain/ports/category.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

/** Product categories of `/categorias`; the code `CAT-001` comes from a sequence. */
@Injectable()
export class CategoriesUseCases extends MasterUseCases<
  CategoryRecord,
  StatusFilter,
  MasterListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(CATEGORY_REPOSITORY) private readonly repo: CategoryRepository,
    @Inject(SEQUENCE_GENERATOR) private readonly sequence: SequenceGenerator,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'categorias',
      inUse: CATEGORY_IN_USE,
      reference: (record) => record.code,
    });
  }

  protected filters(input: MasterListInput): StatusFilter {
    return { status: input.status };
  }

  create(input: CategoryInput, actor: ActingUser): Promise<CategoryRecord> {
    return this.uow.run(async () => {
      const values = await categoryValues(input, this.repo);
      const code = formatCode(
        CATEGORY_CODE.prefix,
        await this.sequence.next(CATEGORY_CODE.key),
        CATEGORY_CODE.digits,
      );
      return this.created(actor, await this.repo.create(code, values));
    });
  }

  update(id: string, patch: CategoryInput, actor: ActingUser): Promise<CategoryRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const values = await categoryValues(
        mergeDefined<CategoryInput>(current, patch),
        this.repo,
        id,
      );
      return this.updated(actor, await this.repo.update(id, values));
    });
  }
}
