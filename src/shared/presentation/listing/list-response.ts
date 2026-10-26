import type { Response } from 'express';
import type { ListOutput } from '../../application/listing/list-query';

export const TOTAL_COUNT_HEADER = 'X-Total-Count';

/**
 * The body of `GET /:resource`. `X-Total-Count` carries the total of a paged request, and of an
 * unpaged one cut at `UNPAGED_LIST_LIMIT`, so a client can tell the list is incomplete.
 */
export function listBody<T>(res: Response, output: ListOutput<T>): readonly T[] {
  if (output.paged || output.total > output.items.length) {
    res.setHeader(TOTAL_COUNT_HEADER, String(output.total));
  }
  return output.items;
}
