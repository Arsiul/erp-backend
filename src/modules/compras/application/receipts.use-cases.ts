import { todayOf } from '../../../shared/application/clock/today';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import {
  type KardexOrigin,
  STOCK_LEDGER,
  type StockLedger,
} from '../../../shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
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
  RECEIPT_REPOSITORY,
  type ReceiptRepository,
} from '../domain/ports/purchasing.repositories';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { optionalId } from '../../../shared/application/listing/list-query';
import { found } from '../../../shared/application/records/found';
import { CREATED_ACTION, UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { requireFound } from '../../../shared/domain/validation/record-rules';
import { RECEIPT_SEQUENCE } from '../domain/purchasing-rules';
import {
  type ReceiptRecord,
  type ReceiptStatus,
  type ReceiptView,
  toReceiptView,
} from '../domain/receipt';
import {
  assertReceiptCancellable,
  assertReceiptEditable,
  guideNumberOf,
  type ReceiptInput,
  type ReceiptPatch,
  receiptValues,
} from '../domain/receipt-rules';
import { refreshOrderProgress } from './purchasing-support';

const RESOURCE = 'recepciones';

export interface ReceiptListInput extends ListInput {
  readonly status?: ReceiptStatus | undefined;
  readonly purchaseOrderId?: string | undefined;
  readonly supplierId?: string | undefined;
}

/**
 * Receipts of `/recepciones`: each one enters its units into the order's warehouse, refreshes
 * what the order has received (partial receipts) and keeps the product cost at the last price.
 */
@Injectable()
export class ReceiptsUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASING_CATALOG) private readonly catalog: PurchasingCatalog,
    @Inject(STOCK_LEDGER) private readonly stock: StockLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: ReceiptListInput): Promise<ListOutput<ReceiptView>> {
    const result = await this.receipts.list({
      ...toListCriteria(input),
      status: input.status,
      purchaseOrderId: optionalId(input.purchaseOrderId),
      supplierId: optionalId(input.supplierId),
    });
    return {
      items: result.items.map(toReceiptView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<ReceiptView> {
    return toReceiptView(found(await this.receipts.findById(id)));
  }

  create(input: ReceiptInput, actor: ActingUser): Promise<ReceiptView> {
    return this.uow.run(async () => {
      const orderId = typeof input.purchaseOrderId === 'string' ? input.purchaseOrderId : '';
      const order = requireFound(
        orderId === '' ? null : await this.orders.findForUpdate(orderId),
        'la orden de compra',
      );
      const today = this.today();
      const values = await receiptValues(order, input, this.catalog, today);
      const counter = await this.sequences.next(RECEIPT_SEQUENCE);
      const number = documentNumber('REC-', counter);
      await this.moveStock(values.warehouseId, values.lines, 1, 'receipt', number, today);
      for (const line of values.lines) {
        await this.catalog.setCostPrice(line.productId, line.unitPrice);
      }
      const created = await this.receipts.create(number, values);
      await refreshOrderProgress(this.orders, this.receipts, order);
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toReceiptView(created);
    });
  }

  /** Only the guide number changes: units and prices already moved the stock. */
  update(id: string, patch: ReceiptPatch, actor: ActingUser): Promise<ReceiptView> {
    return this.uow.run(async () => {
      const current = found(await this.receipts.findForUpdate(id));
      assertReceiptEditable(current);
      const updated =
        patch.guideNumber === undefined
          ? current
          : await this.receipts.setGuideNumber(id, guideNumberOf(patch.guideNumber));
      await this.record(actor, UPDATED_ACTION, updated);
      return toReceiptView(updated);
    });
  }

  /** `cancel`: takes the units back out of the warehouse and reopens what the order awaits. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<ReceiptView> {
    return this.uow.run(async () => {
      const current = found(await this.receipts.findForUpdate(id));
      const action = requireAction(RESOURCE, actionId);
      assertReceiptCancellable(current);
      const order = found(await this.orders.findForUpdate(current.purchaseOrderId));
      await this.moveStock(
        current.warehouseId,
        current.lines,
        -1,
        'receipt_cancel',
        current.number,
        this.today(),
      );
      const cancelled = await this.receipts.setStatus(id, 'cancelled', '');
      await refreshOrderProgress(this.orders, this.receipts, order);
      await this.record(actor, action.label, cancelled);
      return toReceiptView(cancelled);
    });
  }

  /** One kardex movement per line, in product order so concurrent receipts lock alike. */
  private async moveStock(
    warehouseId: string,
    lines: ReceiptRecord['lines'],
    sign: 1 | -1,
    origin: KardexOrigin,
    reference: string,
    date: string,
  ): Promise<void> {
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of sorted) {
      await this.stock.move({
        productId: line.productId,
        warehouseId,
        quantity: sign * line.quantity,
        origin,
        reference,
        date,
        ...(sign === 1 ? { unitCost: line.unitPrice } : {}),
      });
    }
  }

  private today(): string {
    return todayOf(this.clock);
  }

  private record(actor: ActingUser, action: string, receipt: ReceiptRecord): Promise<void> {
    return recordAudit(this.audit, 'compras', actor, RESOURCE, action, receipt.number);
  }
}
