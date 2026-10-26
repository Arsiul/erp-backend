import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { STOCK_LEDGER, type StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import { formatLimaDate } from '../../../shared/domain/time/lima-time';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { adjustmentDraft, type AdjustmentInput, signedQuantity } from '../domain/adjustment-rules';
import {
  type AdjustmentReason,
  type AdjustmentType,
  type AdjustmentView,
  toAdjustmentView,
} from '../domain/inventory';
import { CREATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { requireDate } from '../../../shared/domain/validation/value-rules';
import { INVENTORY_CATALOG, type InventoryCatalog } from '../domain/ports/inventory-catalog';
import {
  ADJUSTMENT_REPOSITORY,
  type AdjustmentRepository,
} from '../domain/ports/inventory.repositories';
import { found } from '../../../shared/application/records/found';
import { recordAudit } from '../../../shared/application/audit/record-audit';

export interface AdjustmentListInput extends ListInput {
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
  readonly type?: AdjustmentType | undefined;
  readonly reason?: AdjustmentReason | undefined;
}

/** Stock adjustments of `/ajustes`: each one moves the stock once and is never edited. */
@Injectable()
export class AdjustmentsUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ADJUSTMENT_REPOSITORY) private readonly adjustments: AdjustmentRepository,
    @Inject(INVENTORY_CATALOG) private readonly catalog: InventoryCatalog,
    @Inject(STOCK_LEDGER) private readonly ledger: StockLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: AdjustmentListInput): Promise<ListOutput<AdjustmentView>> {
    const result = await this.adjustments.list({
      ...toListCriteria(input),
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      reason: input.reason,
    });
    return {
      items: result.items.map(toAdjustmentView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<AdjustmentView> {
    return toAdjustmentView(found(await this.adjustments.findById(id)));
  }

  create(input: AdjustmentInput, actor: ActingUser): Promise<AdjustmentView> {
    return this.uow.run(async () => {
      const draft = await adjustmentDraft(input, this.catalog);
      const today = formatLimaDate(this.clock.now());
      const number = documentNumber('AJ-', await this.sequences.next('ajustes'));
      await this.ledger.move({
        productId: draft.product.id,
        warehouseId: draft.warehouse.id,
        quantity: signedQuantity(draft),
        origin: 'adjustment',
        reference: number,
        date: today,
      });
      const created = await this.adjustments.create({
        number,
        date: requireDate(input.date, today),
        productId: draft.product.id,
        productName: draft.product.name,
        sku: draft.product.sku,
        warehouseId: draft.warehouse.id,
        warehouseName: draft.warehouse.name,
        type: draft.type,
        quantity: draft.quantity,
        reason: draft.reason,
        notes: draft.notes,
      });
      await this.unseen.recordCreated('ajustes', created.id, actor.id);
      await recordAudit(this.audit, 'inventario', actor, 'ajustes', CREATED_ACTION, created.number);
      return toAdjustmentView(created);
    });
  }
}
