import type { Permissions } from '../../../shared/domain/authorization/access-level';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';

export interface AuthRole {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly system: boolean;
  readonly permissions: Permissions;
}

/** A user as the auth flows need it: credentials, lockout counters and the role with its matrix. */
export interface AuthUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly status: ActiveStatus;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly lastAccessAt: Date | null;
  readonly role: AuthRole;
}

/** Same shape as the frontend `Session` (`types/auth.ts`). */
export interface SessionView {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly roleId: string;
    readonly roleName: string;
    readonly status: ActiveStatus;
    readonly lastAccessAt: string;
  };
  readonly role: AuthRole;
  readonly permissions: Permissions;
}

export const toSessionView = (user: AuthUser): SessionView => ({
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.role.id,
    roleName: user.role.name,
    status: user.status,
    lastAccessAt: user.lastAccessAt ? formatLimaDateTime(user.lastAccessAt) : '',
  },
  role: user.role,
  permissions: user.role.permissions,
});

export const toAuthenticatedUser = (user: AuthUser): AuthenticatedUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roleId: user.role.id,
  permissions: user.role.permissions,
});

/** Emails are compared trimmed and in lower case. */
export const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';
