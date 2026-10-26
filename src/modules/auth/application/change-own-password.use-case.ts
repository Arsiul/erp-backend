import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import { assertPasswordPolicy } from '../../../shared/domain/authorization/password-policy';
import { UnauthorizedError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../shared/domain/ports/password-hasher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import { PASSWORD_CHANGED_ACTION, wrongCurrentPassword } from '../domain/login-policy';
import {
  AUTH_USER_REPOSITORY,
  type AuthUserRepository,
} from '../domain/ports/auth-user.repository';
import {
  REFRESH_SESSION_REPOSITORY,
  type RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';
import { type ClientInfo, type IssuedSession, SessionIssuer } from './session-issuer';

export interface ChangeOwnPasswordInput {
  readonly currentPassword: unknown;
  readonly newPassword: unknown;
}

/**
 * The signed-in user changes their password: every other session ends and a fresh one is issued
 * for the caller, all in one UnitOfWork.
 */
@Injectable()
export class ChangeOwnPasswordUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUTH_USER_REPOSITORY) private readonly users: AuthUserRepository,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly issuer: SessionIssuer,
  ) {}

  execute(
    userId: string,
    input: ChangeOwnPasswordInput,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    return this.uow.run(async () => {
      const user = await this.users.findById(userId);
      if (user?.status !== 'active') {
        throw new UnauthorizedError();
      }
      const current = typeof input.currentPassword === 'string' ? input.currentPassword : '';
      if (!(await this.hasher.verify(user.passwordHash, current))) {
        throw wrongCurrentPassword();
      }
      const next = assertPasswordPolicy(input.newPassword);
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(next));
      await this.sessions.revokeAllForUser(user.id);
      await this.audit.record({
        actor: actorOf(user),
        module: 'administracion',
        resource: 'usuarios',
        action: PASSWORD_CHANGED_ACTION,
        reference: user.name,
      });
      return this.issuer.issue(user, null, client);
    });
  }
}
