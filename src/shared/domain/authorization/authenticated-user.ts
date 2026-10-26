import type { AuditActor } from '../ports/audit-logger.port';
import type { Permissions } from './access-level';

/** The user behind the current request, loaded from the database on every request. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roleId: string;
  readonly permissions: Permissions;
}

export const actorOf = (user: Pick<AuthenticatedUser, 'id' | 'name'>): AuditActor => ({
  userId: user.id,
  userName: user.name,
});
