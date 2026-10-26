import type { Permissions } from '../../../shared/domain/authorization/access-level';
import { MODULE_IDS } from '../../../shared/domain/module-id';
import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';
import { type AuthUser, normalizeEmail, toAuthenticatedUser, toSessionView } from './auth-user';
import {
  accountLocked,
  invalidCredentials,
  isLocked,
  LOCK_DURATION_MS,
  lockedUntil,
  MAX_FAILED_ATTEMPTS,
  reachesLockout,
  userInactive,
  wrongCurrentPassword,
} from './login-policy';
import { AUTH_USER_REPOSITORY } from './ports/auth-user.repository';
import { REFRESH_SESSION_REPOSITORY } from './ports/refresh-session.repository';
import { ACCESS_TOKEN_SERVICE, REFRESH_TOKEN_FACTORY } from './ports/token.ports';

const permissions = { ...Object.fromEntries(MODULE_IDS.map((id) => [id, 'none'])) } as Permissions;

const user: AuthUser = {
  id: 'u1',
  name: 'Ana Torres',
  email: 'ana@erp.pe',
  passwordHash: 'hash',
  status: 'active',
  failedAttempts: 0,
  lockedUntil: null,
  lastAccessAt: null,
  role: { id: 'r1', name: 'Ventas', description: '', system: false, permissions },
};

describe('auth user', () => {
  it('maps to the frontend session shape', () => {
    expect(toSessionView(user)).toEqual({
      user: {
        id: 'u1',
        name: 'Ana Torres',
        email: 'ana@erp.pe',
        roleId: 'r1',
        roleName: 'Ventas',
        status: 'active',
        lastAccessAt: '',
      },
      role: user.role,
      permissions,
    });
  });

  it('formats the last access in Lima time', () => {
    const at = new Date('2026-03-10T15:45:00Z');
    expect(toSessionView({ ...user, lastAccessAt: at }).user.lastAccessAt).toBe(
      formatLimaDateTime(at),
    );
  });

  it('maps to the authenticated user of the request', () => {
    expect(toAuthenticatedUser(user)).toEqual({
      id: 'u1',
      name: 'Ana Torres',
      email: 'ana@erp.pe',
      roleId: 'r1',
      permissions,
    });
  });

  it('normalizes emails and ignores non-strings', () => {
    expect(normalizeEmail('  Ana@ERP.pe ')).toBe('ana@erp.pe');
    expect(normalizeEmail(42)).toBe('');
  });
});

describe('login policy', () => {
  const now = new Date('2026-03-10T15:00:00Z');

  it('builds the login errors with their codes', () => {
    expect(invalidCredentials().code).toBe('INVALID_CREDENTIALS');
    expect(accountLocked().code).toBe('ACCOUNT_LOCKED');
    expect(userInactive().code).toBe('USER_INACTIVE');
    expect(wrongCurrentPassword().message).toBe('La contraseña actual no es correcta.');
  });

  it('treats only a future lockedUntil as locked', () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isLocked({ lockedUntil: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isLocked({ lockedUntil: new Date(now.getTime() + 1) }, now)).toBe(true);
  });

  it('locks on the fifth failure for fifteen minutes', () => {
    expect(reachesLockout(MAX_FAILED_ATTEMPTS - 1)).toBe(false);
    expect(reachesLockout(MAX_FAILED_ATTEMPTS)).toBe(true);
    expect(lockedUntil(now).getTime() - now.getTime()).toBe(LOCK_DURATION_MS);
    expect(LOCK_DURATION_MS).toBe(15 * 60_000);
  });

  it('exposes unique injection tokens', () => {
    const tokens = [
      AUTH_USER_REPOSITORY,
      REFRESH_SESSION_REPOSITORY,
      ACCESS_TOKEN_SERVICE,
      REFRESH_TOKEN_FACTORY,
    ];
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
