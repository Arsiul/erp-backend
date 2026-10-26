import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { BANK_LEDGER, type BankLedger } from '../../../shared/domain/ports/bank-ledger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  PAYABLE_LEDGER,
  type PayableLedger,
} from '../../../shared/domain/ports/payable-ledger.port';
import {
  RECEIVABLE_LEDGER,
  type ReceivableLedger,
} from '../../../shared/domain/ports/receivable-ledger.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import { recordAudit } from '../../../shared/application/audit/record-audit';
import { todayOf } from '../../../shared/application/clock/today';
import { found } from '../../../shared/application/records/found';
import { optionalText, requireText } from '../../../shared/domain/validation/field-rules';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import {
  assertEditable,
  assertVoidable,
  type MovementHeader,
  movementHeader,
  type MovementInput,
  paymentMethod,
} from '../domain/movement-rules';
import { CREATED_ACTION, UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import {
  requireActiveRecord,
  requireId,
  requireRecord,
} from '../../../shared/domain/validation/record-rules';
import { requireDate } from '../../../shared/domain/validation/value-rules';
import {
  BANK_ACCOUNT_CATALOG,
  type BankAccountCatalog,
  MOVEMENT_REPOSITORY,
  type MovementRepository,
} from '../domain/ports/treasury.ports';
import {
  balanceDelta,
  type MovementConcept,
  type MovementRecord,
  type MovementStatus,
  type MovementType,
  type MovementView,
  type PaymentMethod,
  toMovementView,
} from '../domain/treasury';

export interface MovementListInput extends ListInput {
  readonly accountId?: string | undefined;
  readonly type?: MovementType | undefined;
  readonly concept?: MovementConcept | undefined;
  readonly method?: PaymentMethod | undefined;
  readonly status?: MovementStatus | undefined;
}

interface Settlement {
  readonly type: MovementType;
  readonly counterparty: string;
  readonly reference: string;
  readonly receivableId: string | null;
  readonly payableId: string | null;
}

const ACCOUNT_LABEL = 'la cuenta';

/** Cash movements of `/movimientos`: collections, payments and other income or expenses. */
@Injectable()
export class MovementsUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(MOVEMENT_REPOSITORY) private readonly movements: MovementRepository,
    @Inject(BANK_ACCOUNT_CATALOG) private readonly accounts: BankAccountCatalog,
    @Inject(BANK_LEDGER) private readonly bank: BankLedger,
    @Inject(RECEIVABLE_LEDGER) private readonly receivables: ReceivableLedger,
    @Inject(PAYABLE_LEDGER) private readonly payables: PayableLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: MovementListInput): Promise<ListOutput<MovementView>> {
    const result = await this.movements.list({
      ...toListCriteria(input),
      accountId: input.accountId,
      type: input.type,
      concept: input.concept,
      method: input.method,
      status: input.status,
    });
    return {
      items: result.items.map(toMovementView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<MovementView> {
    return toMovementView(found(await this.movements.findById(id)));
  }

  create(input: MovementInput, actor: ActingUser): Promise<MovementView> {
    return this.uow.run(async () => {
      const account = await requireActiveRecord(
        input.accountId,
        (id) => this.accounts.findAccount(id),
        ACCOUNT_LABEL,
      );
      const header = movementHeader(input);
      const settlement = await this.settle(header, input);
      await this.bank.apply(account.id, balanceDelta(settlement.type, header.amount));
      const number = documentNumber('MOV-', await this.sequences.next('movimientos'));
      const created = await this.movements.create(number, {
        date: requireDate(input.date, todayOf(this.clock)),
        accountId: account.id,
        accountName: account.name,
        concept: header.concept,
        ...settlement,
        method: paymentMethod(input.method),
        amount: header.amount,
        status: 'posted',
        notes: optionalText(input.notes),
      });
      await this.unseen.recordCreated('movimientos', created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toMovementView(created);
    });
  }

  /** Only the notes change. */
  update(id: string, input: MovementInput, actor: ActingUser): Promise<MovementView> {
    return this.uow.run(async () => {
      const current = found(await this.movements.lockById(id));
      assertEditable(current);
      const notes = input.notes === undefined ? current.notes : optionalText(input.notes);
      const updated = await this.movements.setNotes(id, notes);
      await this.record(actor, UPDATED_ACTION, updated);
      return toMovementView(updated);
    });
  }

  runAction(id: string, actionId: string, actor: ActingUser): Promise<MovementView> {
    return this.uow.run(async () => {
      const action = requireAction('movimientos', actionId);
      const current = found(await this.movements.lockById(id));
      assertVoidable(current);
      const account = await requireRecord(
        current.accountId,
        (accountId) => this.accounts.findAccount(accountId),
        ACCOUNT_LABEL,
      );
      await this.bank.apply(account.id, balanceDelta(current.type, current.amount).negated());
      if (current.receivableId !== null) {
        await this.receivables.revertPayment(current.receivableId, current.amount);
      }
      if (current.payableId !== null) {
        await this.payables.revertPayment(current.payableId, current.amount);
      }
      const updated = await this.movements.setStatus(id, 'voided');
      await this.record(actor, action.label, updated);
      return toMovementView(updated);
    });
  }

  /** Collections and payments lower the document balance and take its counterparty. */
  private async settle(header: MovementHeader, input: MovementInput): Promise<Settlement> {
    if (header.concept === 'collection') {
      const receivableId = requireId(input.receivableId, 'la cuenta por cobrar');
      const result = await this.receivables.applyPayment(receivableId, header.amount);
      return {
        type: 'income',
        counterparty: result.counterpartyName,
        reference: header.reference || result.documentNumber,
        receivableId,
        payableId: null,
      };
    }
    if (header.concept === 'payment') {
      const payableId = requireId(input.payableId, 'la cuenta por pagar');
      const result = await this.payables.applyPayment(payableId, header.amount);
      return {
        type: 'expense',
        counterparty: result.counterpartyName,
        reference: header.reference || result.documentNumber,
        receivableId: null,
        payableId,
      };
    }
    return {
      type: header.type,
      counterparty: requireText(header.counterparty, 'Escribe a quién corresponde el movimiento.'),
      reference: header.reference,
      receivableId: null,
      payableId: null,
    };
  }

  private record(actor: ActingUser, action: string, movement: MovementRecord): Promise<void> {
    return recordAudit(this.audit, 'tesoreria', actor, 'movimientos', action, movement.number);
  }
}
