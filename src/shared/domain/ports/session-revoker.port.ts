export const SESSION_REVOKER = Symbol('SessionRevoker');

/** Ends every refresh session of a user (password reset); runs inside the current UnitOfWork. */
export interface SessionRevoker {
  revokeAllForUser(userId: string): Promise<void>;
}
