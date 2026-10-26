import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import { assertPasswordPolicy } from '../../../shared/domain/authorization/password-policy';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../shared/domain/ports/password-hasher.port';
import {
  SESSION_REVOKER,
  type SessionRevoker,
} from '../../../shared/domain/ports/session-revoker.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  type ActiveStatus,
  assertCanSetStatus,
} from '../../../shared/domain/validation/field-rules';
import { PASSWORD_RESET_ACTION } from '../domain/audit-record';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import { USER_REPOSITORY, type UserRepository } from '../domain/ports/user.repository';
import { toUserView, type UserRecord, type UserView } from '../domain/user';
import {
  assertCanDeactivate,
  assertCanRemoveUser,
  assertOwnUserUpdate,
  type UserInput,
  userValues,
} from '../domain/user-rules';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';

export interface UserListInput extends ListInput {
  readonly status?: ActiveStatus | undefined;
  readonly roleId?: string | undefined;
}

export interface CreateUserInput extends UserInput {
  readonly password?: unknown;
}

export interface ResetPasswordInput {
  readonly password?: unknown;
}

/** Users of `/usuarios`. Every write and its audit entry share one UnitOfWork. */
@Injectable()
export class UsersUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
    @Inject(SESSION_REVOKER) private readonly sessions: SessionRevoker,
  ) {}

  async list(input: UserListInput): Promise<ListOutput<UserView>> {
    const result = await this.users.list({
      ...toListCriteria(input),
      status: input.status,
      roleId: input.roleId,
    });
    return {
      items: result.items.map(toUserView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<UserView> {
    return toUserView(await this.require(id));
  }

  create(input: CreateUserInput, actor: ActingUser): Promise<UserView> {
    return this.uow.run(async () => {
      const values = await userValues(input, this.users);
      const password = assertPasswordPolicy(input.password);
      const created = await this.users.create(values, await this.hasher.hash(password));
      await this.unseen.recordCreated('usuarios', created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toUserView(created);
    });
  }

  update(id: string, patch: UserInput, actor: ActingUser): Promise<UserView> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const values = await userValues(mergeDefined<UserInput>(current, patch), this.users, id);
      assertOwnUserUpdate(current, values, actor.id);
      const updated = await this.users.update(id, values);
      await this.revokeIfDeactivated(current, updated);
      await this.record(actor, UPDATED_ACTION, updated);
      return toUserView(updated);
    });
  }

  remove(id: string, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      assertCanRemoveUser(id, actor.id, await this.users.countAudits(id));
      await this.users.remove(id);
      await this.unseen.forget('usuarios', id);
      await this.record(actor, REMOVED_ACTION, current);
    });
  }

  /** `activate` / `deactivate`; deactivating ends every session of the user. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<UserView> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const action = requireAction('usuarios', actionId);
      const next: ActiveStatus = action.id === 'activate' ? 'active' : 'inactive';
      if (next === 'inactive') {
        assertCanDeactivate(id, actor.id);
      }
      assertCanSetStatus(current.status, next);
      const updated = await this.users.setStatus(id, next);
      await this.revokeIfDeactivated(current, updated);
      await this.record(actor, action.label, updated);
      return toUserView(updated);
    });
  }

  /** An administrator sets a new password: the account is unlocked and its sessions end. */
  resetPassword(id: string, input: ResetPasswordInput, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const password = assertPasswordPolicy(input.password);
      await this.users.setPasswordHash(id, await this.hasher.hash(password));
      await this.sessions.revokeAllForUser(id);
      await this.record(actor, PASSWORD_RESET_ACTION, current);
    });
  }

  private async require(id: string): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (user === null) {
      throw new NotFoundError();
    }
    return user;
  }

  private async revokeIfDeactivated(before: UserRecord, after: UserRecord): Promise<void> {
    if (before.status === 'active' && after.status === 'inactive') {
      await this.sessions.revokeAllForUser(after.id);
    }
  }

  private record(actor: ActingUser, action: string, user: UserRecord): Promise<void> {
    return this.audit.record({
      actor: actorOf(actor),
      module: 'administracion',
      resource: 'usuarios',
      action,
      reference: user.name,
    });
  }
}
