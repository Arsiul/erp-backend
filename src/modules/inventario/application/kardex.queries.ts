import { Inject, Injectable } from '@nestjs/common';
import type { KardexOrigin } from '../../../shared/domain/ports/stock-ledger.port';
import {
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { type KardexView, toKardexView } from '../domain/inventory';
import { KARDEX_REPOSITORY, type KardexRepository } from '../domain/ports/inventory.repositories';
import { found } from '../../../shared/application/records/found';

export interface KardexListInput extends ListInput {
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
  readonly origin?: KardexOrigin | undefined;
}

/** The kardex of `/kardex` is read only: every line is written by the stock ledger. */
@Injectable()
export class KardexQueries {
  constructor(@Inject(KARDEX_REPOSITORY) private readonly kardex: KardexRepository) {}

  async list(input: KardexListInput): Promise<ListOutput<KardexView>> {
    const result = await this.kardex.list({
      ...toListCriteria(input),
      productId: input.productId,
      warehouseId: input.warehouseId,
      origin: input.origin,
    });
    return {
      items: result.items.map(toKardexView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<KardexView> {
    return toKardexView(found(await this.kardex.findById(id)));
  }
}
