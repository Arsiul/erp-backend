import { Inject, Injectable } from '@nestjs/common';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
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
import { optionalText, pickEnum } from '../../../shared/domain/validation/field-rules';
import { CREDIT_NOTE_REASONS, type CreditNoteRecord } from '../domain/commercial';
import {
  assertCreditableLines,
  assertInvoiceIssued,
  assertWithinBalance,
  creditNoteSeries,
  lineProductIds,
  normalizeLines,
  positiveRows,
  requireReceivable,
  seriesNumber,
  seriesSequence,
  totalsOf,
} from '../domain/commercial-rules';
import { balanceStatus } from '../../../shared/domain/money/balance-status';
import { CREATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { requireDate, idText } from '../../../shared/domain/validation/value-rules';
import { requireFound } from '../../../shared/domain/validation/record-rules';
import {
  COMMERCIAL_LOOKUPS,
  type CommercialLookups,
} from '../domain/ports/commercial-lookups.port';
import {
  CREDIT_NOTE_REPOSITORY,
  type CreditNoteRepository,
  INVOICE_REPOSITORY,
  type InvoiceRepository,
  RECEIVABLE_REPOSITORY,
  type ReceivableRepository,
} from '../domain/ports/commercial-repositories.port';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { found } from '../../../shared/application/records/found';
import { todayOf } from '../../../shared/application/clock/today';

export interface CreditNoteInput {
  readonly invoiceId?: unknown;
  readonly issuedAt?: unknown;
  readonly reason?: unknown;
  readonly lines?: unknown;
  readonly notes?: unknown;
}

const RESOURCE = 'notas-credito';

const minus = (a: number, b: number): number => Money.of(a).minus(Money.of(b)).toNumber();
const plus = (a: number, b: number): number => Money.of(a).plus(Money.of(b)).toNumber();

/** Credit notes of `/notas-credito`: they lower the receivable and, on returns, restock. */
@Injectable()
export class CreditNotesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CREDIT_NOTE_REPOSITORY) private readonly notes: CreditNoteRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivables: ReceivableRepository,
    @Inject(COMMERCIAL_LOOKUPS) private readonly lookups: CommercialLookups,
    @Inject(STOCK_LEDGER) private readonly stock: StockLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: ListInput): Promise<ListOutput<CreditNoteRecord>> {
    const result = await this.notes.list(toListCriteria(input));
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  async get(id: string): Promise<CreditNoteRecord> {
    return found(await this.notes.find(id));
  }

  /** Credit notes have no actions: an unknown one is rejected once the record exists. */
  async runAction(id: string, actionId: string): Promise<CreditNoteRecord> {
    const note = await this.get(id);
    requireAction(RESOURCE, actionId);
    return note;
  }

  create(input: CreditNoteInput, actor: ActingUser): Promise<CreditNoteRecord> {
    return this.uow.run(async () => {
      const today = todayOf(this.clock);
      const invoice = requireFound(
        await this.invoices.find(idText(input.invoiceId), true),
        'el comprobante',
      );
      assertInvoiceIssued(invoice);
      const receivable = requireReceivable(
        await this.receivables.findByInvoice(invoice.id, true),
        invoice,
      );
      const reason = pickEnum(input.reason, CREDIT_NOTE_REASONS, 'Elige el motivo.');

      const invoiced = new Map(invoice.lines.map((line) => [line.productId, line]));
      const rows = positiveRows(input.lines);
      const products = await this.lookups.products(lineProductIds(rows));
      const lines = normalizeLines(
        rows,
        products,
        (product) => invoiced.get(product.id)?.unitPrice,
      );
      assertCreditableLines(lines, invoice, await this.lookups.creditedQuantities(invoice.id));
      const settings = await this.lookups.settings();
      const totals = totalsOf(lines, settings.igvRate);
      assertWithinBalance(totals.total, receivable);

      const series = creditNoteSeries(invoice.kind, settings);
      const number = seriesNumber(series, await this.sequences.next(seriesSequence(series)));
      const warehouse = await this.lookups.warehouse(invoice.warehouseId);
      if (reason === 'return') {
        if (warehouse === null) {
          throw new BusinessError('El almacén del comprobante ya no existe.');
        }
        for (const line of lines) {
          await this.stock.move({
            productId: line.productId,
            warehouseId: warehouse.id,
            quantity: line.quantity,
            origin: 'credit_note',
            reference: number,
            date: today,
          });
        }
      }

      const balance = minus(receivable.balance, totals.total);
      await this.receivables.setBalance(receivable.id, {
        creditedAmount: plus(receivable.creditedAmount, totals.total),
        balance,
        status: balanceStatus(receivable.amount, balance),
      });
      await this.invoices.setCreditedAmount(invoice.id, plus(invoice.creditedAmount, totals.total));
      const created = await this.notes.create({
        number,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        warehouseId: invoice.warehouseId,
        warehouseName: warehouse?.name ?? '',
        issuedAt: requireDate(input.issuedAt, today),
        reason,
        lines,
        ...totals,
        notes: optionalText(input.notes),
      });
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, CREATED_ACTION, number);
      return created;
    });
  }
}
