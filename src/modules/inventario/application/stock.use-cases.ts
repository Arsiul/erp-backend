import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { stockReference, type StockView, toStockView } from '../domain/inventory';
import { minStockValue } from '../domain/inventory-fields';
import { UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { STOCK_REPOSITORY, type StockRepository } from '../domain/ports/inventory.repositories';
import { found } from '../../../shared/application/records/found';
import { recordAudit } from '../../../shared/application/audit/record-audit';

export interface StockListInput extends ListInput {
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

export interface StockPatch {
  readonly minStock?: unknown;
}

/** Stock rows of `/stock`: written only by the ledger, except for the minimum. */
@Injectable()
export class StockUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(STOCK_REPOSITORY) private readonly stock: StockRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async list(input: StockListInput): Promise<ListOutput<StockView>> {
    const result = await this.stock.list({
      ...toListCriteria(input),
      productId: input.productId,
      warehouseId: input.warehouseId,
    });
    return {
      items: result.items.map(toStockView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<StockView> {
    return toStockView(found(await this.stock.findById(id)));
  }

  update(id: string, patch: StockPatch, actor: ActingUser): Promise<StockView> {
    return this.uow.run(async () => {
      const current = found(await this.stock.findById(id));
      const minStock = minStockValue(patch.minStock ?? current.minStock);
      const updated = await this.stock.setMinStock(id, minStock);
      await recordAudit(
        this.audit,
        'inventario',
        actor,
        'stock',
        UPDATED_ACTION,
        stockReference(updated),
      );
      return toStockView(updated);
    });
  }
}
