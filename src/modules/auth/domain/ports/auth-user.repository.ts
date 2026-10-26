import type { AuthUser } from '../auth-user';

export const AUTH_USER_REPOSITORY = Symbol('AuthUserRepository');

/** Users seen by the auth flows; every method runs inside the current UnitOfWork. */
export interface AuthUserRepository {
  /** `email` is already normalized (trimmed, lower case). */
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  /** Atomically adds one failed attempt and returns the new count. */
  registerFailure(userId: string): Promise<number>;
  /** Locks the account until `until` and restarts the counter. */
  lock(userId: string, until: Date): Promise<void>;
  /** Clears the lockout counters and stamps the last access. */
  registerSuccess(userId: string, at: Date): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}
