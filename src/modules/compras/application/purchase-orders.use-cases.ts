import { todayOf } from '../../../shared/application/clock/today';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import {
  PURCHASING_CATALOG,
  type PurchasingCatalog,
} from '../domain/ports/purchasing-catalog.port';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from '../domain/ports/purchasing.repositories';
import {
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type PurchaseOrderView,
  toPurchaseOrderView,
} from '../domain/purchase-order';
import {
  activeSupplier,
  assertOrderApprovable,
  assertOrderCancellable,
  assertOrderEditable,
  assertOrderRemovable,
  type PurchaseOrderInput,
  purchaseOrderValues,
} from '../domain/purchase-order-rules';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { optionalId } from '../../../shared/application/listing/list-query';
import { found } from '../../../shared/application/records/found';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { PURCHASE_ORDER_SEQUENCE } from '../domain/purchasing-rules';

const RESOURCE = 'ordenes-compra';

export interface PurchaseOrderListInput extends ListInput {
  readonly status?: PurchaseOrderStatus | undefined;
  readonly supplierId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

/** The body an existing order would send, the base an edit is merged onto. */
const inputOf = (order: PurchaseOrderRecord): PurchaseOrderInput => ({
  supplierId: order.supplierId,
  warehouseId: order.warehouseId,
  issuedAt: order.issuedAt,
  expectedAt: order.expectedAt,
  lines: order.lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toNumber(),
  })),
  notes: order.notes,
});

/** Purchase orders of `/ordenes-compra`: draft → approved → partial/received, or cancelled. */
@Injectable()
export class PurchaseOrdersUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASING_CATALOG) private readonly catalog: PurchasingCatalog,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: PurchaseOrderListInput): Promise<ListOutput<PurchaseOrderView>> {
    const result = await this.orders.list({
      ...toListCriteria(input),
      status: input.status,
      supplierId: optionalId(input.supplierId),
      warehouseId: optionalId(input.warehouseId),
    });
    return {
      items: result.items.map(toPurchaseOrderView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<PurchaseOrderView> {
    return toPurchaseOrderView(found(await this.orders.findById(id)));
  }

  create(input: PurchaseOrderInput, actor: ActingUser): Promise<PurchaseOrderView> {
    return this.uow.run(async () => {
      const values = await purchaseOrderValues(input, this.catalog, this.today());
      const counter = await this.sequences.next(PURCHASE_ORDER_SEQUENCE);
      const created = await this.orders.create(documentNumber('OC-', counter), values);
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toPurchaseOrderView(created);
    });
  }

  update(id: string, patch: PurchaseOrderInput, actor: ActingUser): Promise<PurchaseOrderView> {
    return this.uow.run(async () => {
      const current = found(await this.orders.findForUpdate(id));
      assertOrderEditable(current);
      const values = await purchaseOrderValues(
        mergeDefined(inputOf(current), patch),
        this.catalog,
        this.today(),
      );
      const updated = await this.orders.update(id, values);
      await this.record(actor, UPDATED_ACTION, updated);
      return toPurchaseOrderView(updated);
    });
  }

  remove(id: string, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = found(await this.orders.findForUpdate(id));
      assertOrderRemovable(current);
      await this.orders.remove(id);
      await this.unseen.forget(RESOURCE, id);
      await this.record(actor, REMOVED_ACTION, current);
    });
  }

  /** `approve` (draft with an active supplier) or `cancel` (draft or approved, nothing received). */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<PurchaseOrderView> {
    return this.uow.run(async () => {
      const current = found(await this.orders.findForUpdate(id));
      const action = requireAction(RESOURCE, actionId);
      if (action.id === 'approve') {
        assertOrderApprovable(current);
        await activeSupplier(this.catalog, current.supplierId);
      } else {
        assertOrderCancellable(current);
      }
      const updated = await this.orders.setStatus(
        id,
        action.id === 'approve' ? 'approved' : 'cancelled',
      );
      await this.record(actor, action.label, updated);
      return toPurchaseOrderView(updated);
    });
  }

  private today(): string {
    return todayOf(this.clock);
  }

  private record(actor: ActingUser, action: string, order: PurchaseOrderRecord): Promise<void> {
    return recordAudit(this.audit, 'compras', actor, RESOURCE, action, order.number);
  }
}
