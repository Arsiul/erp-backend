import { listOffset } from '../pagination/pagination';
import type { AuthenticatedUser } from '../../domain/authorization/authenticated-user';
import { BusinessError } from '../../domain/errors/domain-error';
import { isIsoDay, limaDayEnd, limaDayStart } from '../../domain/time/lima-time';
import type { ListCriteria, SortOrder } from '../../domain/listing/list-criteria';

/** The user running a use case; its id drives the self-protection rules and the audit trail. */
export type ActingUser = Pick<AuthenticatedUser, 'id' | 'name'>;

/** Query of `GET /:resource`. Without `page` the first `UNPAGED_LIST_LIMIT` rows. */
export interface ListInput {
  readonly q?: string | undefined;
  /** Lima day `YYYY-MM-DD`, inclusive. */
  readonly from?: string | undefined;
  /** Lima day `YYYY-MM-DD`, inclusive. */
  readonly to?: string | undefined;
  /** Order of creation; `desc` (newest first) by default. */
  readonly sort?: SortOrder | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface ListOutput<T> {
  readonly items: readonly T[];
  readonly total: number;
  /** True when `page` was requested; the controller then sends `X-Total-Count`. */
  readonly paged: boolean;
}

export const INVALID_DATE = 'La fecha no es válida.';

function day(value: string | undefined, toDate: (day: string) => Date): Date | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!isIsoDay(value)) {
    throw new BusinessError(INVALID_DATE);
  }
  return toDate(value);
}

export function toListCriteria(input: ListInput): ListCriteria {
  return {
    q: input.q?.trim() ?? '',
    from: day(input.from, limaDayStart),
    to: day(input.to, limaDayEnd),
    order: input.sort ?? 'desc',
    window: listOffset(input.page, input.pageSize),
  };
}

/** Copies the defined fields of `patch` over `current` (absent DTO fields arrive as undefined). */
export function mergeDefined<T extends object>(current: T, patch: Readonly<Partial<T>>): T {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

/** An optional id filter of a list: an empty query value means no filter. */
export const optionalId = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();
