import { todayOf } from '../../../shared/application/clock/today';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
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
import { payableOf } from '../domain/payable';
import {
  PURCHASING_CATALOG,
  type PurchasingCatalog,
} from '../domain/ports/purchasing-catalog.port';
import {
  PAYABLE_REPOSITORY,
  type PayableRepository,
  RECEIPT_REPOSITORY,
  type ReceiptRepository,
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepository,
} from '../domain/ports/purchasing.repositories';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { optionalId } from '../../../shared/application/listing/list-query';
import { found } from '../../../shared/application/records/found';
import { CREATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { requireFound } from '../../../shared/domain/validation/record-rules';
import type { ReceiptRecord } from '../domain/receipt';
import {
  type SupplierInvoiceRecord,
  type SupplierInvoiceStatus,
  type SupplierInvoiceView,
  toSupplierInvoiceView,
} from '../domain/supplier-invoice';
import {
  assertInvoiceCancellable,
  type SupplierInvoiceInput,
  supplierInvoiceValues,
} from '../domain/supplier-invoice-rules';

const RESOURCE = 'facturas-proveedor';

export interface SupplierInvoiceListInput extends ListInput {
  readonly status?: SupplierInvoiceStatus | undefined;
  readonly supplierId?: string | undefined;
  readonly receiptId?: string | undefined;
}

/**
 * Supplier invoices of `/facturas-proveedor`: registering one opens its payable and bills the
 * receipt it settles; cancelling it reverts both.
 */
@Injectable()
export class SupplierInvoicesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepository,
    @Inject(PAYABLE_REPOSITORY) private readonly payables: PayableRepository,
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(PURCHASING_CATALOG) private readonly catalog: PurchasingCatalog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: SupplierInvoiceListInput): Promise<ListOutput<SupplierInvoiceView>> {
    const result = await this.invoices.list({
      ...toListCriteria(input),
      status: input.status,
      supplierId: optionalId(input.supplierId),
      receiptId: optionalId(input.receiptId),
    });
    return {
      items: result.items.map(toSupplierInvoiceView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<SupplierInvoiceView> {
    return toSupplierInvoiceView(found(await this.invoices.findById(id)));
  }

  create(input: SupplierInvoiceInput, actor: ActingUser): Promise<SupplierInvoiceView> {
    return this.uow.run(async () => {
      const receipt = await this.billedReceipt(input.receiptId);
      const values = await supplierInvoiceValues(
        input,
        receipt,
        this.catalog,
        (supplierId, documentNumber) => this.invoices.existsActive(supplierId, documentNumber),
        this.today(),
      );
      const created = await this.invoices.create(values);
      const payable = await this.payables.create(payableOf(created));
      if (receipt !== null) {
        await this.receipts.setStatus(receipt.id, 'billed', created.documentNumber);
      }
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await this.unseen.recordCreated('cuentas-pagar', payable.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toSupplierInvoiceView(created);
    });
  }

  /** `cancel`: voids the invoice and its payable (no payments yet) and frees the receipt. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<SupplierInvoiceView> {
    return this.uow.run(async () => {
      const current = found(await this.invoices.findForUpdate(id));
      const action = requireAction(RESOURCE, actionId);
      const payable = await this.payables.findByInvoiceForUpdate(id);
      const receipt =
        current.receiptId === null ? null : await this.receipts.findForUpdate(current.receiptId);
      assertInvoiceCancellable(current, payable);
      const cancelled = await this.invoices.cancel(id);
      if (payable !== null) {
        await this.payables.cancel(payable.id);
      }
      if (receipt !== null && receipt.status === 'billed') {
        await this.receipts.setStatus(receipt.id, 'pending_bill', '');
      }
      await this.record(actor, action.label, cancelled);
      return toSupplierInvoiceView(cancelled);
    });
  }

  /** The receipt the invoice bills, locked; none when the body names none. */
  private async billedReceipt(receiptId: unknown): Promise<ReceiptRecord | null> {
    const id = typeof receiptId === 'string' ? receiptId.trim() : '';
    if (id === '') {
      return null;
    }
    return requireFound(await this.receipts.findForUpdate(id), 'la recepción');
  }

  private today(): string {
    return todayOf(this.clock);
  }

  private record(actor: ActingUser, action: string, invoice: SupplierInvoiceRecord): Promise<void> {
    return recordAudit(
      this.audit,
      'compras',
      actor,
      RESOURCE,
      action,
      `${invoice.documentNumber} · ${invoice.supplierName}`,
    );
  }
}
