import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import {
  type ActiveStatus,
  assertCanSetStatus,
} from '../../../shared/domain/validation/field-rules';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import type {
  MasterRecord,
  MasterRepository,
  StatusFilter,
} from '../domain/ports/master.repository';

export interface MasterListInput extends ListInput {
  readonly status?: ActiveStatus | undefined;
}

export interface MasterResource<R> {
  readonly key: ResourceKey;
  /** Message of the 422 answered when a referenced record is removed. */
  readonly inUse: string;
  /** Value written as the audit reference. */
  reference(record: R): string;
}

export interface MasterPorts {
  readonly uow: UnitOfWork;
  readonly audit: AuditLogger;
  readonly unseen: UnseenRecords;
}

/**
 * List, read, delete and the `activate` / `deactivate` actions shared by every master
 * resource; subclasses add their own create and update rules.
 */
export abstract class MasterUseCases<
  R extends MasterRecord,
  F extends StatusFilter,
  Q extends MasterListInput,
> {
  protected readonly uow: UnitOfWork;
  private readonly audit: AuditLogger;
  private readonly unseen: UnseenRecords;

  protected constructor(
    ports: MasterPorts,
    private readonly repository: MasterRepository<R, F>,
    private readonly resource: MasterResource<R>,
  ) {
    this.uow = ports.uow;
    this.audit = ports.audit;
    this.unseen = ports.unseen;
  }

  protected abstract filters(input: Q): F;

  async list(input: Q): Promise<ListOutput<R>> {
    const result = await this.repository.list({ ...toListCriteria(input), ...this.filters(input) });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  get(id: string): Promise<R> {
    return this.require(id);
  }

  remove(id: string, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      if (await this.repository.isInUse(id)) {
        throw new BusinessError(this.resource.inUse);
      }
      await this.repository.remove(id);
      await this.unseen.forget(this.resource.key, id);
      await this.record(actor, REMOVED_ACTION, current);
    });
  }

  runAction(id: string, actionId: string, actor: ActingUser): Promise<R> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const action = requireAction(this.resource.key, actionId);
      const next: ActiveStatus = action.id === 'activate' ? 'active' : 'inactive';
      assertCanSetStatus(current.status, next);
      const updated = await this.repository.setStatus(id, next);
      await this.record(actor, action.label, updated);
      return updated;
    });
  }

  /** Marks a new record as unseen and audits it; runs inside the caller's unit of work. */
  protected async created(actor: ActingUser, record: R): Promise<R> {
    await this.unseen.recordCreated(this.resource.key, record.id, actor.id);
    await this.record(actor, CREATED_ACTION, record);
    return record;
  }

  protected async updated(actor: ActingUser, record: R): Promise<R> {
    await this.record(actor, UPDATED_ACTION, record);
    return record;
  }

  protected async require(id: string): Promise<R> {
    const record = await this.repository.findById(id);
    if (record === null) {
      throw new NotFoundError();
    }
    return record;
  }

  private record(actor: ActingUser, action: string, record: R): Promise<void> {
    return this.audit.record({
      actor: actorOf(actor),
      module: 'maestros',
      resource: this.resource.key,
      action,
      reference: this.resource.reference(record),
    });
  }
}
