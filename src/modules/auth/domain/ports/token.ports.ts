export const ACCESS_TOKEN_SERVICE = Symbol('AccessTokenService');
export const REFRESH_TOKEN_FACTORY = Symbol('RefreshTokenFactory');

export interface AccessTokenClaims {
  readonly userId: string;
  readonly roleId: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  /** Lifetime in seconds. */
  readonly expiresIn: number;
}

/** Short-lived signed token sent as `Authorization: Bearer`. */
export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  /** The user id of a valid, unexpired token; null otherwise. Never throws. */
  verify(token: string): Promise<string | null>;
}

/** Opaque refresh tokens and the one-way hash stored in the database. */
export interface RefreshTokenFactory {
  generate(): string;
  hash(token: string): string;
}
