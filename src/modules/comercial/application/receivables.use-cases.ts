import { Inject, Injectable } from '@nestjs/common';
import {
  type ListInput,
  type ListOutput,
  optionalId,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import type { ReceivableFilter, ReceivableRecord } from '../domain/commercial';
import {
  RECEIVABLE_REPOSITORY,
  type ReceivableRepository,
} from '../domain/ports/commercial-repositories.port';
import { found } from '../../../shared/application/records/found';
import { todayOf } from '../../../shared/application/clock/today';

export interface ReceivableListInput extends ListInput {
  readonly status?: ReceivableFilter | undefined;
  readonly customerId?: string | undefined;
}

/** Receivables of `/cuentas-cobrar`: read only, they move with invoices, notes and collections. */
@Injectable()
export class ReceivablesUseCases {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivables: ReceivableRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(input: ReceivableListInput): Promise<ListOutput<ReceivableRecord>> {
    const result = await this.receivables.list(toListCriteria(input), {
      status: input.status,
      customerId: optionalId(input.customerId),
      today: todayOf(this.clock),
    });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  async get(id: string): Promise<ReceivableRecord> {
    return found(await this.receivables.find(id));
  }

  /** Receivables have no actions: an unknown one is rejected once the record exists. */
  async runAction(id: string, actionId: string): Promise<ReceivableRecord> {
    const receivable = await this.get(id);
    requireAction('cuentas-cobrar', actionId);
    return receivable;
  }
}
