import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import { ROLE_REPOSITORY, type RoleRepository } from '../domain/ports/role.repository';
import type { RoleRecord } from '../domain/role';
import {
  assertRoleEditable,
  assertRoleRemovable,
  type RoleInput,
  roleValues,
} from '../domain/role-rules';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';

/** Roles of `/roles` with their permission matrix. System roles are read-only. */
@Injectable()
export class RolesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: ListInput): Promise<ListOutput<RoleRecord>> {
    const result = await this.roles.list(toListCriteria(input));
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  get(id: string): Promise<RoleRecord> {
    return this.require(id);
  }

  create(input: RoleInput, actor: ActingUser): Promise<RoleRecord> {
    return this.uow.run(async () => {
      const created = await this.roles.create(await roleValues(input, this.roles));
      await this.unseen.recordCreated('roles', created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return created;
    });
  }

  update(id: string, patch: RoleInput, actor: ActingUser): Promise<RoleRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      assertRoleEditable(current);
      const values = await roleValues(mergeDefined<RoleInput>(current, patch), this.roles, id);
      const updated = await this.roles.update(id, values);
      await this.record(actor, UPDATED_ACTION, updated);
      return updated;
    });
  }

  remove(id: string, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      assertRoleRemovable(current, await this.roles.countUsers(id));
      await this.roles.remove(id);
      await this.unseen.forget('roles', id);
      await this.record(actor, REMOVED_ACTION, current);
    });
  }

  /** Roles have no actions in the catalog: an existing role answers 404 for any of them. */
  async runAction(id: string, actionId: string): Promise<RoleRecord> {
    const role = await this.require(id);
    requireAction('roles', actionId);
    return role;
  }

  private async require(id: string): Promise<RoleRecord> {
    const role = await this.roles.findById(id);
    if (role === null) {
      throw new NotFoundError();
    }
    return role;
  }

  private record(actor: ActingUser, action: string, role: RoleRecord): Promise<void> {
    return this.audit.record({
      actor: actorOf(actor),
      module: 'administracion',
      resource: 'roles',
      action,
      reference: role.name,
    });
  }
}
