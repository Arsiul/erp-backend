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
import { STOCK_LEDGER, type StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import { optionalText, pickEnum } from '../../../shared/domain/validation/field-rules';
import { PAYMENT_TERMS, type SaleRecord, type SaleStatus } from '../domain/commercial';
import {
  assertCreditChange,
  assertCreditSale,
  assertQuoteConvertible,
  assertQuoteCustomer,
  assertSaleCancellable,
  assertSaleEditable,
  lineProductIds,
  normalizeLines,
  requireSeller,
  SALE_SEQUENCE,
  totalsOf,
} from '../domain/commercial-rules';
import { CREATED_ACTION, UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { requireActive, requireFound } from '../../../shared/domain/validation/record-rules';
import { requireDate, idText } from '../../../shared/domain/validation/value-rules';
import {
  COMMERCIAL_LOOKUPS,
  type CommercialLookups,
} from '../domain/ports/commercial-lookups.port';
import {
  QUOTE_REPOSITORY,
  type QuoteRepository,
  SALE_REPOSITORY,
  type SaleRepository,
} from '../domain/ports/commercial-repositories.port';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { found } from '../../../shared/application/records/found';
import { todayOf } from '../../../shared/application/clock/today';

export interface SaleInput {
  readonly quoteId?: unknown;
  readonly customerId?: unknown;
  readonly warehouseId?: unknown;
  readonly issuedAt?: unknown;
  readonly seller?: unknown;
  readonly paymentTerm?: unknown;
  readonly lines?: unknown;
  readonly notes?: unknown;
}

export interface SaleListInput extends ListInput {
  readonly status?: SaleStatus | undefined;
}

const RESOURCE = 'ventas';
const PAYMENT_TERM_MESSAGE = 'Elige la condición de pago.';

/** Sales of `/ventas`: they ship stock when registered and give it back when cancelled. */
@Injectable()
export class SalesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SALE_REPOSITORY) private readonly sales: SaleRepository,
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(COMMERCIAL_LOOKUPS) private readonly lookups: CommercialLookups,
    @Inject(STOCK_LEDGER) private readonly stock: StockLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: SaleListInput): Promise<ListOutput<SaleRecord>> {
    const result = await this.sales.list(toListCriteria(input), {
      status: input.status,
      today: todayOf(this.clock),
    });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  async get(id: string): Promise<SaleRecord> {
    return found(await this.sales.find(id));
  }

  create(input: SaleInput, actor: ActingUser): Promise<SaleRecord> {
    return this.uow.run(async () => {
      const today = todayOf(this.clock);
      const quote = input.quoteId
        ? requireFound(await this.quotes.find(idText(input.quoteId), true), 'la cotización')
        : null;
      if (quote !== null) {
        assertQuoteConvertible(quote);
      }
      const customer = requireActive(
        await this.lookups.customer(idText(input.customerId ?? quote?.customerId), true),
        'el cliente',
      );
      assertQuoteCustomer(quote, customer);
      const warehouse = requireActive(
        await this.lookups.warehouse(idText(input.warehouseId)),
        'el almacén de despacho',
      );
      const lineInput = input.lines ?? quote?.lines;
      const products = await this.lookups.products(lineProductIds(lineInput));
      const lines = normalizeLines(lineInput, products, (product) => product.salePrice);
      const settings = await this.lookups.settings();
      const totals = totalsOf(lines, settings.igvRate);
      const paymentTerm = pickEnum(input.paymentTerm, PAYMENT_TERMS, PAYMENT_TERM_MESSAGE, 'cash');
      if (paymentTerm === 'credit') {
        assertCreditSale(customer, totals.total, await this.lookups.exposure(customer.id));
      }
      const issuedAt = requireDate(input.issuedAt, today);
      const seller = requireSeller(input.seller ?? quote?.seller);

      const number = documentNumber('VTA-', await this.sequences.next(SALE_SEQUENCE));
      for (const line of lines) {
        await this.stock.move({
          productId: line.productId,
          warehouseId: warehouse.id,
          quantity: -line.quantity,
          origin: 'sale',
          reference: number,
          date: today,
        });
      }
      if (quote !== null) {
        await this.quotes.setStatus(quote.id, 'converted', number);
      }
      const created = await this.sales.create({
        number,
        customerId: customer.id,
        customerName: customer.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        quoteId: quote?.id ?? '',
        quoteNumber: quote?.number ?? '',
        issuedAt,
        seller,
        paymentTerm,
        lines,
        ...totals,
        status: 'pending_invoice',
        invoiceId: '',
        invoiceNumber: '',
        notes: optionalText(input.notes),
      });
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, CREATED_ACTION, number);
      return created;
    });
  }

  /** Lines already moved stock: only the seller, the payment term and the notes change. */
  update(id: string, input: SaleInput, actor: ActingUser): Promise<SaleRecord> {
    return this.uow.run(async () => {
      const current = found(await this.sales.find(id, true));
      assertSaleEditable(current);
      const paymentTerm = pickEnum(
        input.paymentTerm,
        PAYMENT_TERMS,
        PAYMENT_TERM_MESSAGE,
        current.paymentTerm,
      );
      if (paymentTerm === 'credit' && current.paymentTerm === 'cash') {
        const customer = requireFound(
          await this.lookups.customer(current.customerId, true),
          'el cliente',
        );
        assertCreditChange(
          customer,
          current.total,
          await this.lookups.exposure(customer.id, current.id),
        );
      }
      const updated = await this.sales.update(id, {
        seller: requireSeller(input.seller ?? current.seller),
        paymentTerm,
        notes: optionalText(input.notes ?? current.notes),
      });
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, UPDATED_ACTION, updated.number);
      return updated;
    });
  }

  /** `cancel` gives the stock back and reopens the converted quote. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<SaleRecord> {
    return this.uow.run(async () => {
      const current = found(await this.sales.find(id, true));
      const action = requireAction(RESOURCE, actionId);
      assertSaleCancellable(current);
      const today = todayOf(this.clock);
      for (const line of current.lines) {
        await this.stock.move({
          productId: line.productId,
          warehouseId: current.warehouseId,
          quantity: line.quantity,
          origin: 'sale_cancel',
          reference: current.number,
          date: today,
        });
      }
      if (current.quoteId !== '' && (await this.quotes.find(current.quoteId, true)) !== null) {
        await this.quotes.setStatus(current.quoteId, 'accepted', '');
      }
      const updated = await this.sales.setStatus(id, 'cancelled');
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, action.label, updated.number);
      return updated;
    });
  }
}
