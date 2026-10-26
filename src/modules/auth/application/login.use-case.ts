import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import type { DomainError } from '../../../shared/domain/errors/domain-error';
import {
  AUDIT_LOGGER,
  type AuditActor,
  type AuditLogger,
} from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../shared/domain/ports/password-hasher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import { normalizeEmail } from '../domain/auth-user';
import {
  accountLocked,
  invalidCredentials,
  isLocked,
  LOGIN_FAILED_ACTION,
  lockedUntil,
  reachesLockout,
  UNKNOWN_ACTOR_NAME,
  userInactive,
} from '../domain/login-policy';
import {
  AUTH_USER_REPOSITORY,
  type AuthUserRepository,
} from '../domain/ports/auth-user.repository';
import { UnknownEmailLockout } from '../domain/unknown-email-lockout';
import { type ClientInfo, type IssuedSession, SessionIssuer } from './session-issuer';

export interface LoginInput {
  readonly email: unknown;
  readonly password: unknown;
}

type LoginOutcome =
  | { readonly ok: true; readonly session: IssuedSession }
  | { readonly ok: false; readonly error: DomainError };

/**
 * Email + password login. Failures are audited and counted inside the UnitOfWork and the error
 * is thrown only after it commits, so the audit row and the lockout counter are never rolled back.
 */
@Injectable()
export class LoginUseCase {
  /** Verified when the email is unknown, so both failures take the same time. */
  private dummyHash: Promise<string> | undefined;
  /** Unknown emails lock like accounts, so the lockout does not reveal which emails exist. */
  private readonly unknownEmails = new UnknownEmailLockout();

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUTH_USER_REPOSITORY) private readonly users: AuthUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly issuer: SessionIssuer,
  ) {}

  async execute(input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const outcome = await this.uow.run(async (): Promise<LoginOutcome> => {
      const now = this.clock.now();
      const user = await this.users.findByEmail(email);
      if (!user) {
        return this.failUnknown(email, password, now);
      }
      if (isLocked(user, now)) {
        return this.fail(actorOf(user), email, accountLocked());
      }
      if (!(await this.hasher.verify(user.passwordHash, password))) {
        const attempts = await this.users.registerFailure(user.id);
        if (reachesLockout(attempts)) {
          await this.users.lock(user.id, lockedUntil(now));
          return this.fail(actorOf(user), email, accountLocked());
        }
        return this.fail(actorOf(user), email, invalidCredentials());
      }
      if (user.status !== 'active') {
        return this.fail(actorOf(user), email, userInactive());
      }
      await this.users.registerSuccess(user.id, now);
      const session = await this.issuer.issue(
        { ...user, failedAttempts: 0, lockedUntil: null, lastAccessAt: now },
        null,
        client,
      );
      return { ok: true, session };
    });
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.session;
  }

  private async fail(actor: AuditActor, email: string, error: DomainError): Promise<LoginOutcome> {
    await this.audit.record({
      actor,
      module: 'administracion',
      resource: 'usuarios',
      action: LOGIN_FAILED_ACTION,
      reference: email,
    });
    return { ok: false, error };
  }

  /** Mirrors the account path: a locked email skips the hash, the fifth failure locks it. */
  private async failUnknown(email: string, password: string, now: Date): Promise<LoginOutcome> {
    const actor = { userId: null, userName: UNKNOWN_ACTOR_NAME };
    if (this.unknownEmails.isLocked(email, now)) {
      return this.fail(actor, email, accountLocked());
    }
    await this.hasher.verify(await this.getDummyHash(), password);
    const locks = this.unknownEmails.registerFailure(email, now);
    return this.fail(actor, email, locks ? accountLocked() : invalidCredentials());
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('dummy-password-for-timing');
    return this.dummyHash;
  }
}
