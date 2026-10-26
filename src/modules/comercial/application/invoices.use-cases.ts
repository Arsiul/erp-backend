import { Inject, Injectable } from '@nestjs/common';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
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
import type { InvoiceRecord, InvoiceStatus } from '../domain/commercial';
import {
  assertInvoiceCancellable,
  assertInvoiceDate,
  assertReceivableUntouched,
  assertSaleInvoiceable,
  customerDocument,
  invoiceKind,
  invoiceSeries,
  requireReceivable,
  seriesNumber,
  seriesSequence,
} from '../domain/commercial-rules';
import { addDays } from '../../../shared/domain/time/lima-time';
import { CREATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { requireDate, idText } from '../../../shared/domain/validation/value-rules';
import { requireFound } from '../../../shared/domain/validation/record-rules';
import {
  COMMERCIAL_LOOKUPS,
  type CommercialLookups,
} from '../domain/ports/commercial-lookups.port';
import {
  INVOICE_REPOSITORY,
  type InvoiceRepository,
  RECEIVABLE_REPOSITORY,
  type ReceivableRepository,
  SALE_REPOSITORY,
  type SaleRepository,
} from '../domain/ports/commercial-repositories.port';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { found } from '../../../shared/application/records/found';
import { todayOf } from '../../../shared/application/clock/today';

export interface InvoiceInput {
  readonly saleId?: unknown;
  readonly kind?: unknown;
  readonly issuedAt?: unknown;
}

export interface InvoiceListInput extends ListInput {
  readonly status?: InvoiceStatus | undefined;
}

const RESOURCE = 'comprobantes';

/** Invoices of `/comprobantes`: each one bills a sale and opens its receivable. */
@Injectable()
export class InvoicesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(SALE_REPOSITORY) private readonly sales: SaleRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivables: ReceivableRepository,
    @Inject(COMMERCIAL_LOOKUPS) private readonly lookups: CommercialLookups,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: InvoiceListInput): Promise<ListOutput<InvoiceRecord>> {
    const result = await this.invoices.list(toListCriteria(input), {
      status: input.status,
      today: todayOf(this.clock),
    });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  async get(id: string): Promise<InvoiceRecord> {
    return found(await this.invoices.find(id));
  }

  create(input: InvoiceInput, actor: ActingUser): Promise<InvoiceRecord> {
    return this.uow.run(async () => {
      const sale = requireFound(
        await this.sales.find(idText(input.saleId), true),
        'la venta a facturar',
      );
      assertSaleInvoiceable(sale);
      const customer = requireFound(await this.lookups.customer(sale.customerId), 'el cliente');
      const kind = invoiceKind(input.kind, customer);
      const issuedAt = requireDate(input.issuedAt, todayOf(this.clock));
      assertInvoiceDate(issuedAt, sale);
      const dueAt =
        sale.paymentTerm === 'credit' ? addDays(issuedAt, customer.creditDays) : issuedAt;
      const series = invoiceSeries(kind, await this.lookups.settings());
      const number = seriesNumber(series, await this.sequences.next(seriesSequence(series)));

      const invoice = await this.invoices.create({
        kind,
        number,
        saleId: sale.id,
        saleNumber: sale.number,
        customerId: customer.id,
        customerName: customer.name,
        customerDocument: customerDocument(customer),
        warehouseId: sale.warehouseId,
        issuedAt,
        dueAt,
        lines: sale.lines,
        subtotal: sale.subtotal,
        igv: sale.igv,
        total: sale.total,
        creditedAmount: 0,
        status: 'issued',
      });
      await this.receivables.create({
        invoiceId: invoice.id,
        documentNumber: number,
        customerId: customer.id,
        customerName: customer.name,
        issuedAt,
        dueAt,
        amount: invoice.total,
        paidAmount: 0,
        creditedAmount: 0,
        balance: invoice.total,
        status: 'pending',
      });
      await this.sales.setInvoice(sale.id, { id: invoice.id, number });
      await this.unseen.recordCreated(RESOURCE, invoice.id, actor.id);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, CREATED_ACTION, number);
      return invoice;
    });
  }

  /** `cancel` voids an untouched invoice, closes its receivable and reopens the sale. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<InvoiceRecord> {
    return this.uow.run(async () => {
      const current = found(await this.invoices.find(id, true));
      const action = requireAction(RESOURCE, actionId);
      assertInvoiceCancellable(current);
      const receivable = requireReceivable(
        await this.receivables.findByInvoice(current.id, true),
        current,
      );
      assertReceivableUntouched(receivable, current);
      const updated = await this.invoices.setStatus(id, 'cancelled');
      await this.receivables.setBalance(receivable.id, {
        creditedAmount: receivable.creditedAmount,
        balance: 0,
        status: 'cancelled',
      });
      if ((await this.sales.find(current.saleId, true)) !== null) {
        await this.sales.setInvoice(current.saleId, null);
      }
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, action.label, updated.number);
      return updated;
    });
  }
}
