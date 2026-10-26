import type { SessionRevoker } from '../../../../shared/domain/ports/session-revoker.port';

export const REFRESH_SESSION_REPOSITORY = Symbol('RefreshSessionRepository');

export interface RefreshSession {
  readonly id: string;
  readonly userId: string;
  /** Every rotation of one login shares the family; reusing an old token revokes all of it. */
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewRefreshSession {
  readonly id: string;
  readonly userId: string;
  /** SHA-256 of the opaque token; the token itself is never stored. */
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly ip: string;
  readonly userAgent: string;
}

/** Refresh sessions; revocations stamp the Clock time and run inside the current UnitOfWork. */
export interface RefreshSessionRepository extends SessionRevoker {
  create(session: NewRefreshSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  /** Revokes the session only if it is still active; false when another request won the race. */
  revoke(id: string): Promise<boolean>;
  revokeFamily(familyId: string): Promise<void>;
}
