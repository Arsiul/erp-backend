import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';

/** A user as stored, without the password hash (it never leaves the repository). */
export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly status: ActiveStatus;
  readonly lastAccessAt: Date | null;
}

/** The shape of `User` in the frontend. */
export interface UserView {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly status: ActiveStatus;
  /** `YYYY-MM-DDTHH:mm` in Lima, or an empty string when the user never signed in. */
  readonly lastAccessAt: string;
}

export const toUserView = (user: UserRecord): UserView => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roleId: user.roleId,
  roleName: user.roleName,
  status: user.status,
  lastAccessAt: user.lastAccessAt ? formatLimaDateTime(user.lastAccessAt) : '',
});

/** Editable fields after validation. */
export interface UserValues {
  readonly name: string;
  readonly email: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly status: ActiveStatus;
}
