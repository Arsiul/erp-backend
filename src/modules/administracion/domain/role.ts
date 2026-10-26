import type { Permissions } from '../../../shared/domain/authorization/access-level';

/** The shape of `Role` in the frontend. */
export interface RoleRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: Permissions;
  readonly system: boolean;
}

export interface RoleValues {
  readonly name: string;
  readonly description: string;
  readonly permissions: Permissions;
}
