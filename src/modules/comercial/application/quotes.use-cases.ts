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
import { optionalText } from '../../../shared/domain/validation/field-rules';
import type { QuoteFilter, QuoteRecord } from '../domain/commercial';
import {
  assertQuoteEditable,
  assertQuoteRemovable,
  assertQuoteValidity,
  lineProductIds,
  normalizeLines,
  QUOTE_SEQUENCE,
  quoteActionStatus,
  requireSeller,
  totalsOf,
} from '../domain/commercial-rules';
import { addDays } from '../../../shared/domain/time/lima-time';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { requireActive } from '../../../shared/domain/validation/record-rules';
import { requireDate, idText } from '../../../shared/domain/validation/value-rules';
import {
  COMMERCIAL_LOOKUPS,
  type CommercialLookups,
} from '../domain/ports/commercial-lookups.port';
import {
  QUOTE_REPOSITORY,
  type QuoteRepository,
} from '../domain/ports/commercial-repositories.port';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { found } from '../../../shared/application/records/found';
import { todayOf } from '../../../shared/application/clock/today';

export interface QuoteInput {
  readonly customerId?: unknown;
  readonly issuedAt?: unknown;
  readonly validUntil?: unknown;
  readonly seller?: unknown;
  readonly lines?: unknown;
  readonly notes?: unknown;
}

export interface QuoteListInput extends ListInput {
  readonly status?: QuoteFilter | undefined;
}

const RESOURCE = 'cotizaciones';

/** Quotes of `/cotizaciones`: draft → sent → accepted → converted by a sale, or rejected. */
@Injectable()
export class QuotesUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(COMMERCIAL_LOOKUPS) private readonly lookups: CommercialLookups,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: QuoteListInput): Promise<ListOutput<QuoteRecord>> {
    const result = await this.quotes.list(toListCriteria(input), {
      status: input.status,
      today: todayOf(this.clock),
    });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  async get(id: string): Promise<QuoteRecord> {
    return found(await this.quotes.find(id));
  }

  create(input: QuoteInput, actor: ActingUser): Promise<QuoteRecord> {
    return this.uow.run(async () => {
      const customer = requireActive(
        await this.lookups.customer(idText(input.customerId)),
        'el cliente',
      );
      const issuedAt = requireDate(input.issuedAt, todayOf(this.clock));
      const lines = await this.linesOf(input.lines);
      const settings = await this.lookups.settings();
      const validUntil = requireDate(
        input.validUntil,
        addDays(issuedAt, settings.quoteValidityDays),
      );
      const seller = requireSeller(input.seller);
      const created = await this.quotes.create({
        number: documentNumber('COT-', await this.sequences.next(QUOTE_SEQUENCE)),
        customerId: customer.id,
        customerName: customer.name,
        issuedAt,
        validUntil,
        seller,
        lines,
        ...totalsOf(lines, settings.igvRate),
        status: 'draft',
        saleNumber: '',
        notes: optionalText(input.notes),
      });
      await this.unseen.recordCreated(RESOURCE, created.id, actor.id);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, CREATED_ACTION, created.number);
      return created;
    });
  }

  update(id: string, input: QuoteInput, actor: ActingUser): Promise<QuoteRecord> {
    return this.uow.run(async () => {
      const current = found(await this.quotes.find(id, true));
      assertQuoteEditable(current);
      const customer =
        input.customerId && input.customerId !== current.customerId
          ? requireActive(await this.lookups.customer(idText(input.customerId)), 'el cliente')
          : { id: current.customerId, name: current.customerName };
      const issuedAt = requireDate(input.issuedAt, current.issuedAt);
      const validUntil = requireDate(input.validUntil, current.validUntil);
      assertQuoteValidity(issuedAt, validUntil);
      const lines = input.lines ? await this.linesOf(input.lines) : current.lines;
      const settings = await this.lookups.settings();
      const updated = await this.quotes.update(id, {
        number: current.number,
        customerId: customer.id,
        customerName: customer.name,
        issuedAt,
        validUntil,
        seller: requireSeller(input.seller ?? current.seller),
        lines,
        ...totalsOf(lines, settings.igvRate),
        status: current.status,
        saleNumber: current.saleNumber,
        notes: optionalText(input.notes ?? current.notes),
      });
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, UPDATED_ACTION, updated.number);
      return updated;
    });
  }

  remove(id: string, actor: ActingUser): Promise<void> {
    return this.uow.run(async () => {
      const current = found(await this.quotes.find(id, true));
      assertQuoteRemovable(current);
      await this.quotes.remove(id);
      await this.unseen.forget(RESOURCE, id);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, REMOVED_ACTION, current.number);
    });
  }

  /** `send`, `accept` and `reject` only change the status. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<QuoteRecord> {
    return this.uow.run(async () => {
      const current = found(await this.quotes.find(id, true));
      const action = requireAction(RESOURCE, actionId);
      const status = quoteActionStatus(action.id, current, todayOf(this.clock));
      const updated = await this.quotes.setStatus(id, status);
      await recordAudit(this.audit, 'comercial', actor, RESOURCE, action.label, updated.number);
      return updated;
    });
  }

  private async linesOf(input: unknown) {
    const products = await this.lookups.products(lineProductIds(input));
    return normalizeLines(input, products, (product) => product.salePrice);
  }
}
