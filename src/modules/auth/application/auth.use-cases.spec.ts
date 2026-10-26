import type { Permissions } from '../../../shared/domain/authorization/access-level';
import { capabilitiesFor } from '../../../shared/domain/authorization/capabilities';
import { BusinessError, UnauthorizedError } from '../../../shared/domain/errors/domain-error';
import { MODULE_IDS } from '../../../shared/domain/module-id';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type { IdGenerator } from '../../../shared/domain/ports/id-generator.port';
import type { PasswordHasher } from '../../../shared/domain/ports/password-hasher.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { AuthUser } from '../domain/auth-user';
import {
  accountLocked,
  LOCK_DURATION_MS,
  LOGIN_FAILED_ACTION,
  MAX_FAILED_ATTEMPTS,
  PASSWORD_CHANGED_ACTION,
  UNKNOWN_ACTOR_NAME,
} from '../domain/login-policy';
import type { AuthUserRepository } from '../domain/ports/auth-user.repository';
import type {
  NewRefreshSession,
  RefreshSession,
  RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
  RefreshTokenFactory,
} from '../domain/ports/token.ports';
import { AuthenticateRequestUseCase } from './authenticate-request.use-case';
import { ChangeOwnPasswordUseCase } from './change-own-password.use-case';
import { GetSessionUseCase } from './get-session.use-case';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { type ClientInfo, SessionIssuer } from './session-issuer';

const NOW = new Date('2026-03-10T15:00:00Z');
const REFRESH_TTL_MS = 7 * 24 * 3_600_000;
const CLIENT: ClientInfo = { ip: '10.0.0.1', userAgent: 'jest' };

const permissions = {
  ...Object.fromEntries(MODULE_IDS.map((id) => [id, 'none'])),
  comercial: 'write',
} as Permissions;

const baseUser: AuthUser = {
  id: 'u1',
  name: 'Ana Torres',
  email: 'ana@erp.pe',
  passwordHash: 'h:secreto-123',
  status: 'active',
  failedAttempts: 0,
  lockedUntil: null,
  lastAccessAt: null,
  role: { id: 'r1', name: 'Ventas', description: '', system: false, permissions },
};

class ImmediateUnitOfWork implements UnitOfWork {
  runs = 0;

  run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return work();
  }
}

class FixedClock implements Clock {
  current = NOW;

  now(): Date {
    return this.current;
  }
}

class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${String(this.count)}`;
  }
}

class PrefixHasher implements PasswordHasher {
  hashes = 0;

  hash(plain: string): Promise<string> {
    this.hashes += 1;
    return Promise.resolve(`h:${plain}`);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(hash === `h:${plain}`);
  }
}

class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class MemoryUsers implements AuthUserRepository {
  readonly rows = new Map<string, AuthUser>();

  constructor(...users: AuthUser[]) {
    for (const user of users) {
      this.rows.set(user.id, user);
    }
  }

  get(id: string): AuthUser {
    const user = this.rows.get(id);
    if (!user) {
      throw new Error(`missing user ${id}`);
    }
    return user;
  }

  findByEmail(email: string): Promise<AuthUser | null> {
    return Promise.resolve([...this.rows.values()].find((user) => user.email === email) ?? null);
  }

  findById(id: string): Promise<AuthUser | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  registerFailure(userId: string): Promise<number> {
    const user = this.get(userId);
    const failedAttempts = user.failedAttempts + 1;
    this.rows.set(userId, { ...user, failedAttempts });
    return Promise.resolve(failedAttempts);
  }

  lock(userId: string, until: Date): Promise<void> {
    this.rows.set(userId, { ...this.get(userId), lockedUntil: until });
    return Promise.resolve();
  }

  registerSuccess(userId: string, at: Date): Promise<void> {
    this.rows.set(userId, {
      ...this.get(userId),
      failedAttempts: 0,
      lockedUntil: null,
      lastAccessAt: at,
    });
    return Promise.resolve();
  }

  updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.rows.set(userId, { ...this.get(userId), passwordHash });
    return Promise.resolve();
  }
}

interface StoredSession extends NewRefreshSession {
  revokedAt: Date | null;
}

class MemorySessions implements RefreshSessionRepository {
  readonly rows: StoredSession[] = [];

  create(session: NewRefreshSession): Promise<void> {
    this.rows.push({ ...session, revokedAt: null });
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const row = this.rows.find((session) => session.tokenHash === tokenHash);
    return Promise.resolve(row ? { ...row } : null);
  }

  revoke(id: string): Promise<boolean> {
    const row = this.rows.find((session) => session.id === id && session.revokedAt === null);
    if (row) {
      row.revokedAt = NOW;
    }
    return Promise.resolve(row !== undefined);
  }

  revokeFamily(familyId: string): Promise<void> {
    this.revokeWhere((session) => session.familyId === familyId);
    return Promise.resolve();
  }

  revokeAllForUser(userId: string): Promise<void> {
    this.revokeWhere((session) => session.userId === userId);
    return Promise.resolve();
  }

  active(): StoredSession[] {
    return this.rows.filter((session) => session.revokedAt === null);
  }

  private revokeWhere(match: (session: StoredSession) => boolean): void {
    for (const session of this.rows) {
      if (match(session)) {
        session.revokedAt ??= NOW;
      }
    }
  }
}

class FakeAccessTokens implements AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    return Promise.resolve({ token: `at:${claims.userId}`, expiresIn: 900 });
  }

  verify(token: string): Promise<string | null> {
    return Promise.resolve(token.startsWith('at:') ? token.slice(3) : null);
  }
}

class FakeRefreshTokens implements RefreshTokenFactory {
  private count = 0;

  generate(): string {
    this.count += 1;
    return `rt-${String(this.count)}`;
  }

  hash(token: string): string {
    return `sha:${token}`;
  }
}

function setup(...users: AuthUser[]) {
  const uow = new ImmediateUnitOfWork();
  const clock = new FixedClock();
  const hasher = new PrefixHasher();
  const audit = new MemoryAudit();
  const userRepo = new MemoryUsers(...(users.length > 0 ? users : [baseUser]));
  const sessions = new MemorySessions();
  const accessTokens = new FakeAccessTokens();
  const refreshTokens = new FakeRefreshTokens();
  const issuer = new SessionIssuer(
    accessTokens,
    refreshTokens,
    sessions,
    new SequentialIds(),
    clock,
    { refreshTtlMs: REFRESH_TTL_MS },
  );
  return {
    uow,
    clock,
    hasher,
    audit,
    users: userRepo,
    sessions,
    issuer,
    login: new LoginUseCase(uow, userRepo, hasher, audit, clock, issuer),
    refresh: new RefreshSessionUseCase(uow, sessions, refreshTokens, userRepo, clock, issuer),
    logout: new LogoutUseCase(uow, sessions, refreshTokens),
    getSession: new GetSessionUseCase(userRepo),
    authenticate: new AuthenticateRequestUseCase(accessTokens, userRepo),
    changePassword: new ChangeOwnPasswordUseCase(uow, userRepo, sessions, hasher, audit, issuer),
  };
}

describe('SessionIssuer', () => {
  it('starts a new family and signs the access token', async () => {
    const { issuer, sessions } = setup();
    const issued = await issuer.issue(baseUser, null, CLIENT);

    expect(issued).toMatchObject({ accessToken: 'at:u1', expiresIn: 900, refreshToken: 'rt-1' });
    expect(issued.refreshExpiresAt.getTime()).toBe(NOW.getTime() + REFRESH_TTL_MS);
    expect(issued.session.user.roleName).toBe('Ventas');
    expect(sessions.rows).toEqual([
      {
        id: 'id-1',
        userId: 'u1',
        tokenHash: 'sha:rt-1',
        familyId: 'id-2',
        expiresAt: issued.refreshExpiresAt,
        ip: '10.0.0.1',
        userAgent: 'jest',
        revokedAt: null,
      },
    ]);
  });

  it('keeps the family it rotates', async () => {
    const { issuer, sessions } = setup();
    await issuer.issue(baseUser, 'family-1', CLIENT);
    expect(sessions.rows[0]?.familyId).toBe('family-1');
  });
});

describe('LoginUseCase', () => {
  it('issues a session and resets the counters on success', async () => {
    const ctx = setup({ ...baseUser, failedAttempts: 3 });
    const issued = await ctx.login.execute(
      { email: '  ANA@erp.pe ', password: 'secreto-123' },
      CLIENT,
    );

    expect(issued.accessToken).toBe('at:u1');
    expect(issued.session.user.lastAccessAt).not.toBe('');
    expect(ctx.users.get('u1')).toMatchObject({ failedAttempts: 0, lastAccessAt: NOW });
    expect(ctx.sessions.active()).toHaveLength(1);
    expect(ctx.audit.entries).toEqual([]);
  });

  it('answers an unknown email like a wrong password and audits it anonymously', async () => {
    const ctx = setup();
    const attempt = (): Promise<unknown> =>
      ctx.login.execute({ email: 'nadie@erp.pe', password: 'x' }, CLIENT);

    await expect(attempt()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(attempt()).rejects.toBeInstanceOf(BusinessError);
    expect(ctx.hasher.hashes).toBe(1);
    expect(ctx.audit.entries[0]).toEqual({
      actor: { userId: null, userName: UNKNOWN_ACTOR_NAME },
      module: 'administracion',
      resource: 'usuarios',
      action: LOGIN_FAILED_ACTION,
      reference: 'nadie@erp.pe',
    });
  });

  it('locks an unknown email on the fifth failure with the same message as an account', async () => {
    const ctx = setup();
    const attempt = (email: string): Promise<unknown> =>
      ctx.login.execute({ email, password: 'mal' }, CLIENT);
    for (let failure = 1; failure < MAX_FAILED_ATTEMPTS; failure += 1) {
      await expect(attempt('nadie@erp.pe')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    const locked = await attempt('nadie@erp.pe').catch((error: unknown) => error);
    expect(locked).toEqual(accountLocked());
    await expect(attempt('NADIE@erp.pe')).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    await expect(attempt('otro@erp.pe')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(ctx.audit.entries).toHaveLength(MAX_FAILED_ATTEMPTS + 2);

    ctx.clock.current = new Date(NOW.getTime() + LOCK_DURATION_MS);
    await expect(attempt('nadie@erp.pe')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('counts a wrong password and treats a missing one as wrong', async () => {
    const ctx = setup();
    await expect(
      ctx.login.execute({ email: 'ana@erp.pe', password: undefined }, CLIENT),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(ctx.users.get('u1').failedAttempts).toBe(1);
    expect(ctx.audit.entries[0]?.actor).toEqual({ userId: 'u1', userName: 'Ana Torres' });
    expect(ctx.sessions.rows).toEqual([]);
  });

  it('locks the account on the fifth consecutive failure', async () => {
    const ctx = setup({ ...baseUser, failedAttempts: MAX_FAILED_ATTEMPTS - 1 });
    await expect(
      ctx.login.execute({ email: 'ana@erp.pe', password: 'mal' }, CLIENT),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });

    expect(ctx.users.get('u1').lockedUntil?.getTime()).toBe(NOW.getTime() + LOCK_DURATION_MS);
  });

  it('rejects a locked account even with the right password', async () => {
    const ctx = setup({ ...baseUser, lockedUntil: new Date(NOW.getTime() + 60_000) });
    await expect(
      ctx.login.execute({ email: 'ana@erp.pe', password: 'secreto-123' }, CLIENT),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(ctx.audit.entries).toHaveLength(1);
  });

  it('tells an inactive user only after the password is right', async () => {
    const ctx = setup({ ...baseUser, status: 'inactive' });
    await expect(
      ctx.login.execute({ email: 'ana@erp.pe', password: 'mal' }, CLIENT),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      ctx.login.execute({ email: 'ana@erp.pe', password: 'secreto-123' }, CLIENT),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});

describe('RefreshSessionUseCase', () => {
  async function loggedIn(...users: AuthUser[]) {
    const ctx = setup(...users);
    const first = await ctx.login.execute({ email: 'ana@erp.pe', password: 'secreto-123' }, CLIENT);
    return { ...ctx, first };
  }

  it('requires the cookie', async () => {
    const ctx = setup();
    await expect(ctx.refresh.execute(undefined, CLIENT)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(ctx.uow.runs).toBe(0);
  });

  it('rejects an unknown token', async () => {
    const ctx = setup();
    await expect(ctx.refresh.execute('rt-x', CLIENT)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rotates the token inside the same family', async () => {
    const ctx = await loggedIn();
    const second = await ctx.refresh.execute(ctx.first.refreshToken, CLIENT);

    expect(second.refreshToken).not.toBe(ctx.first.refreshToken);
    const [old, current] = ctx.sessions.rows;
    expect(old?.revokedAt).toEqual(NOW);
    expect(current).toMatchObject({ familyId: old?.familyId, revokedAt: null });
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const ctx = await loggedIn();
    await ctx.refresh.execute(ctx.first.refreshToken, CLIENT);

    await expect(ctx.refresh.execute(ctx.first.refreshToken, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(ctx.sessions.active()).toEqual([]);
  });

  it('revokes the family when a concurrent refresh already took the token', async () => {
    const ctx = await loggedIn();
    jest.spyOn(ctx.sessions, 'revoke').mockResolvedValueOnce(false);

    await expect(ctx.refresh.execute(ctx.first.refreshToken, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(ctx.sessions.active()).toEqual([]);
  });

  it('rejects an expired token', async () => {
    const ctx = await loggedIn();
    ctx.clock.current = new Date(NOW.getTime() + REFRESH_TTL_MS);

    await expect(ctx.refresh.execute(ctx.first.refreshToken, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('ends the family of a user deactivated meanwhile', async () => {
    const ctx = await loggedIn();
    ctx.users.rows.set('u1', { ...ctx.users.get('u1'), status: 'inactive' });

    await expect(ctx.refresh.execute(ctx.first.refreshToken, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(ctx.sessions.active()).toEqual([]);
  });
});

describe('LogoutUseCase', () => {
  it('does nothing without a cookie or with an unknown token', async () => {
    const ctx = setup();
    await ctx.logout.execute(undefined);
    expect(ctx.uow.runs).toBe(0);
    await expect(ctx.logout.execute('rt-x')).resolves.toBeUndefined();
  });

  it('revokes the family of the presented token', async () => {
    const ctx = setup();
    const first = await ctx.login.execute({ email: 'ana@erp.pe', password: 'secreto-123' }, CLIENT);
    await ctx.refresh.execute(first.refreshToken, CLIENT);

    await ctx.logout.execute(first.refreshToken);
    expect(ctx.sessions.active()).toEqual([]);
  });
});

describe('GetSessionUseCase', () => {
  it('returns the session with the capabilities of the role', async () => {
    const { getSession } = setup();
    const session = await getSession.execute('u1');
    expect(session.user.email).toBe('ana@erp.pe');
    expect(session.capabilities).toEqual(capabilitiesFor(permissions));
  });

  it('rejects a missing or inactive user', async () => {
    const { getSession } = setup({ ...baseUser, status: 'inactive' });
    await expect(getSession.execute('u1')).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(getSession.execute('nope')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthenticateRequestUseCase', () => {
  it('resolves a valid token to the current user', async () => {
    const { authenticate } = setup();
    await expect(authenticate.execute('at:u1')).resolves.toEqual({
      id: 'u1',
      name: 'Ana Torres',
      email: 'ana@erp.pe',
      roleId: 'r1',
      permissions,
    });
  });

  it.each([undefined, '', 'forged', 'at:ghost'])('rejects the token %p', async (token) => {
    const { authenticate } = setup();
    await expect(authenticate.execute(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects the token of a deactivated user', async () => {
    const { authenticate } = setup({ ...baseUser, status: 'inactive' });
    await expect(authenticate.execute('at:u1')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('ChangeOwnPasswordUseCase', () => {
  const input = { currentPassword: 'secreto-123', newPassword: 'nuevo-secreto-456' };

  it('changes the hash, ends every session and issues a fresh one', async () => {
    const ctx = setup();
    await ctx.login.execute({ email: 'ana@erp.pe', password: 'secreto-123' }, CLIENT);

    const issued = await ctx.changePassword.execute('u1', input, CLIENT);

    expect(ctx.users.get('u1').passwordHash).toBe('h:nuevo-secreto-456');
    expect(ctx.sessions.active()).toEqual([
      expect.objectContaining({ tokenHash: `sha:${issued.refreshToken}` }),
    ]);
    expect(ctx.audit.entries).toEqual([
      {
        actor: { userId: 'u1', userName: 'Ana Torres' },
        module: 'administracion',
        resource: 'usuarios',
        action: PASSWORD_CHANGED_ACTION,
        reference: 'Ana Torres',
      },
    ]);
  });

  it('rejects a missing or inactive user', async () => {
    const ctx = setup({ ...baseUser, status: 'inactive' });
    await expect(ctx.changePassword.execute('u1', input, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(ctx.changePassword.execute('nope', input, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('requires the current password', async () => {
    const ctx = setup();
    for (const currentPassword of ['mal', 42]) {
      await expect(
        ctx.changePassword.execute('u1', { ...input, currentPassword }, CLIENT),
      ).rejects.toThrow('La contraseña actual no es correcta.');
    }
    expect(ctx.users.get('u1').passwordHash).toBe('h:secreto-123');
  });

  it('applies the password policy to the new password', async () => {
    const ctx = setup();
    await expect(
      ctx.changePassword.execute('u1', { ...input, newPassword: 'corta' }, CLIENT),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});
