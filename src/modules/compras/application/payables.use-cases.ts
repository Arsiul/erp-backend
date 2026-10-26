import { todayOf } from '../../../shared/application/clock/today';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import { type PayableFilter, type PayableView, toPayableView } from '../domain/payable';
import {
  PAYABLE_REPOSITORY,
  type PayableRepository,
} from '../domain/ports/purchasing.repositories';
import { optionalId } from '../../../shared/application/listing/list-query';
import { found } from '../../../shared/application/records/found';

export interface PayableListInput extends ListInput {
  readonly status?: PayableFilter | undefined;
  readonly supplierId?: string | undefined;
}

/**
 * Payables of `/cuentas-pagar`, read only: supplier invoices open them and treasury payments
 * settle them. `overdue` is an open payable already past its due date in Lima.
 */
@Injectable()
export class PayablesUseCases {
  constructor(
    @Inject(PAYABLE_REPOSITORY) private readonly payables: PayableRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(input: PayableListInput): Promise<ListOutput<PayableView>> {
    const result = await this.payables.list({
      ...toListCriteria(input),
      status: input.status,
      supplierId: optionalId(input.supplierId),
      today: todayOf(this.clock),
    });
    return {
      items: result.items.map(toPayableView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<PayableView> {
    return toPayableView(found(await this.payables.findById(id)));
  }

  /** Payables have no actions: an existing one answers that the action does not exist. */
  async runAction(id: string, actionId: string): Promise<PayableView> {
    const payable = found(await this.payables.findById(id));
    requireAction('cuentas-pagar', actionId);
    return toPayableView(payable);
  }
}
