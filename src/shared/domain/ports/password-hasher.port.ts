export const PASSWORD_HASHER = Symbol('PasswordHasher');

/** One-way password hashing; plain passwords never leave the use case that receives them. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /** False for a wrong password or a malformed hash; never throws. */
  verify(hash: string, plain: string): Promise<boolean>;
}
