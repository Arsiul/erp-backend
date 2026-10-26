import type { ActingUser } from '../../../shared/application/listing/list-query';
import { UNKNOWN_ACTION } from '../../../shared/application/listing/resource-actions';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ListResult } from '../../../shared/domain/listing/list-criteria';
import { Money } from '../../../shared/domain/money/money';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { BankLedger } from '../../../shared/domain/ports/bank-ledger.port';
import type { Clock } from '../../../shared/domain/ports/clock.port';
import type { PayableLedger } from '../../../shared/domain/ports/payable-ledger.port';
import type { ReceivableLedger } from '../../../shared/domain/ports/receivable-ledger.port';
import type { SequenceGenerator } from '../../../shared/domain/ports/sequence-generator.port';
import type { SettlementResult } from '../../../shared/domain/ports/settlement';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import type {
  BankAccountCatalog,
  CatalogAccount,
  MovementCriteria,
  MovementRepository,
} from '../domain/ports/treasury.ports';
import type { MovementRecord, MovementStatus, MovementValues } from '../domain/treasury';
import { MovementsUseCases } from './movements.use-cases';

const ADMIN: ActingUser = { id: 'admin', name: 'Administrador' };
const TODAY = '2026-10-25';
const FIXED_CLOCK: Clock = { now: () => new Date('2026-10-25T15:00:00Z') };

class ImmediateUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => `${entry.module} ${entry.action} ${entry.reference}`);
  }
}

class MemoryUnseen implements UnseenRecords {
  readonly created: string[] = [];

  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    this.created.push(`${resource}/${recordId} by ${authorId}`);
    return Promise.resolve();
  }

  forget(): Promise<void> {
    return Promise.resolve();
  }
}

class MemorySequences implements SequenceGenerator {
  private value = 0;

  next(): Promise<number> {
    this.value += 1;
    return Promise.resolve(this.value);
  }
}

class MemoryAccounts implements BankAccountCatalog {
  constructor(readonly accounts: CatalogAccount[]) {}

  findAccount(id: string): Promise<CatalogAccount | null> {
    return Promise.resolve(this.accounts.find((account) => account.id === id) ?? null);
  }
}

class MemoryBank implements BankLedger {
  readonly balances = new Map<string, Money>([['ba-1', Money.of(100)]]);

  apply(accountId: string, delta: Money): Promise<Money> {
    const next = (this.balances.get(accountId) ?? Money.of(0)).plus(delta);
    if (next.isNegative()) {
      return Promise.reject(new BusinessError('BCP no tiene saldo suficiente.'));
    }
    this.balances.set(accountId, next);
    return Promise.resolve(next);
  }
}

/** One open document per id; payments lower its balance and reverts raise it back. */
class MemoryDocuments implements ReceivableLedger, PayableLedger {
  readonly balances = new Map<string, Money>();

  constructor(
    private readonly documentNumber: string,
    private readonly counterpartyName: string,
    private readonly missing: string,
  ) {}

  applyPayment(id: string, amount: Money): Promise<SettlementResult> {
    return this.move(id, amount.negated());
  }

  revertPayment(id: string, amount: Money): Promise<SettlementResult> {
    return this.move(id, amount);
  }

  private move(id: string, delta: Money): Promise<SettlementResult> {
    const current = this.balances.get(id);
    if (current === undefined) {
      return Promise.reject(new BusinessError(this.missing));
    }
    const balance = current.plus(delta);
    this.balances.set(id, balance);
    return Promise.resolve({
      documentNumber: this.documentNumber,
      counterpartyName: this.counterpartyName,
      balance,
      status: balance.isZero() ? 'paid' : 'partial',
    });
  }
}

class MemoryMovements implements MovementRepository {
  readonly rows: MovementRecord[] = [];
  readonly locked: string[] = [];
  lastCriteria: MovementCriteria | undefined;

  list(criteria: MovementCriteria): Promise<ListResult<MovementRecord>> {
    this.lastCriteria = criteria;
    const items = this.rows.filter(
      (row) =>
        (criteria.type === undefined || row.type === criteria.type) &&
        (criteria.status === undefined || row.status === criteria.status),
    );
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<MovementRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  lockById(id: string): Promise<MovementRecord | null> {
    this.locked.push(id);
    return this.findById(id);
  }

  create(number: string, values: MovementValues): Promise<MovementRecord> {
    const record = { ...values, id: `mov-${String(this.rows.length + 1)}`, number };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  setNotes(id: string, notes: string): Promise<MovementRecord> {
    return Promise.resolve(this.replace(id, { notes }));
  }

  setStatus(id: string, status: MovementStatus): Promise<MovementRecord> {
    return Promise.resolve(this.replace(id, { status }));
  }

  private replace(id: string, patch: Partial<MovementValues>): MovementRecord {
    const index = this.rows.findIndex((row) => row.id === id);
    const current = this.rows[index];
    if (!current) {
      throw new Error('Missing movement');
    }
    const record = { ...current, ...patch };
    this.rows[index] = record;
    return record;
  }
}

function setup() {
  const movements = new MemoryMovements();
  const accounts = new MemoryAccounts([
    { id: 'ba-1', name: 'BCP Soles', status: 'active' },
    { id: 'ba-2', name: 'Caja chica', status: 'inactive' },
  ]);
  const bank = new MemoryBank();
  const receivables = new MemoryDocuments(
    'F001-00000001',
    'Cliente SAC',
    'Selecciona la cuenta por cobrar.',
  );
  receivables.balances.set('cxc-1', Money.of(80));
  const payables = new MemoryDocuments(
    'FP-0001',
    'Proveedor SRL',
    'Selecciona la cuenta por pagar.',
  );
  payables.balances.set('cxp-1', Money.of(60));
  const audit = new MemoryAudit();
  const unseen = new MemoryUnseen();
  const useCases = new MovementsUseCases(
    new ImmediateUnitOfWork(),
    movements,
    accounts,
    bank,
    receivables,
    payables,
    new MemorySequences(),
    FIXED_CLOCK,
    audit,
    unseen,
  );
  const balanceOf = (id: string) => bank.balances.get(id)?.toNumber();
  return { useCases, movements, bank, receivables, payables, audit, unseen, accounts, balanceOf };
}

const other = { accountId: 'ba-1', concept: 'other', counterparty: 'SUNAT', amount: 30 };

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected a rejection');
}

async function businessMessage(promise: Promise<unknown>): Promise<string> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(BusinessError);
  return error.message;
}

describe('MovementsUseCases', () => {
  describe('create', () => {
    it('registers other income and raises the account balance', async () => {
      const { useCases, balanceOf, audit, unseen } = setup();
      const created = await useCases.create({ ...other, notes: '  nota ' }, ADMIN);
      expect(created).toEqual({
        id: 'mov-1',
        number: 'MOV-00001',
        date: TODAY,
        accountId: 'ba-1',
        accountName: 'BCP Soles',
        type: 'income',
        concept: 'other',
        receivableId: '',
        payableId: '',
        counterparty: 'SUNAT',
        reference: '',
        method: 'transfer',
        amount: 30,
        status: 'posted',
        notes: 'nota',
      });
      expect(balanceOf('ba-1')).toBe(130);
      expect(audit.actions()).toEqual(['tesoreria Registró MOV-00001']);
      expect(audit.entries[0]).toMatchObject({
        actor: { userId: 'admin', userName: 'Administrador' },
        resource: 'movimientos',
      });
      expect(unseen.created).toEqual(['movimientos/mov-1 by admin']);
    });

    it('registers other expenses with the given date and method', async () => {
      const { useCases, balanceOf } = setup();
      const created = await useCases.create(
        { ...other, type: 'expense', amount: '40.555', date: '2026-10-01', method: 'cash' },
        ADMIN,
      );
      expect(created).toMatchObject({
        type: 'expense',
        amount: 40.56,
        date: '2026-10-01',
        method: 'cash',
      });
      expect(balanceOf('ba-1')).toBe(59.44);
    });

    it('rejects an expense above the balance without registering it', async () => {
      const { useCases, movements, balanceOf } = setup();
      const message = await businessMessage(
        useCases.create({ ...other, type: 'expense', amount: 500 }, ADMIN),
      );
      expect(message).toBe('BCP no tiene saldo suficiente.');
      expect(movements.rows).toHaveLength(0);
      expect(balanceOf('ba-1')).toBe(100);
    });

    it('settles a receivable as income with its customer and number', async () => {
      const { useCases, receivables, balanceOf } = setup();
      const created = await useCases.create(
        {
          accountId: 'ba-1',
          concept: 'collection',
          receivableId: 'cxc-1',
          type: 'expense',
          amount: 50,
        },
        ADMIN,
      );
      expect(created).toMatchObject({
        type: 'income',
        counterparty: 'Cliente SAC',
        reference: 'F001-00000001',
        receivableId: 'cxc-1',
        payableId: '',
      });
      expect(receivables.balances.get('cxc-1')?.toNumber()).toBe(30);
      expect(balanceOf('ba-1')).toBe(150);
    });

    it('settles a payable as an expense and keeps a typed reference', async () => {
      const { useCases, payables, balanceOf } = setup();
      const created = await useCases.create(
        {
          accountId: 'ba-1',
          concept: 'payment',
          payableId: 'cxp-1',
          reference: 'OP-77',
          counterparty: 'ignorado',
          amount: 60,
        },
        ADMIN,
      );
      expect(created).toMatchObject({
        type: 'expense',
        counterparty: 'Proveedor SRL',
        reference: 'OP-77',
        payableId: 'cxp-1',
        receivableId: '',
      });
      expect(payables.balances.get('cxp-1')?.toNumber()).toBe(0);
      expect(balanceOf('ba-1')).toBe(40);
    });

    it.each([
      [{ ...other, accountId: '' }, 'Selecciona la cuenta.'],
      [{ ...other, accountId: 'nope' }, 'Selecciona la cuenta.'],
      [{ ...other, accountId: 'ba-2' }, 'No puedes usar la cuenta porque está en estado inactivo.'],
      [{ ...other, concept: 'gift' }, 'Elige el concepto.'],
      [{ ...other, amount: '' }, 'El importe debe ser mayor que cero.'],
      [{ ...other, amount: 'abc' }, 'Escribe el importe.'],
      [{ ...other, amount: -5 }, 'Escribe el importe.'],
      [{ ...other, amount: 0.001 }, 'El importe debe ser mayor que cero.'],
      [{ ...other, amount: 1_000_000_000_000 }, 'El importe supera el máximo permitido.'],
      [{ ...other, amount: 1e20 }, 'El importe supera el máximo permitido.'],
      [{ ...other, type: 'transfer' }, 'Elige si es ingreso o egreso.'],
      [{ ...other, counterparty: '   ' }, 'Escribe a quién corresponde el movimiento.'],
      [{ ...other, date: '25/10/2026' }, 'La fecha no es válida.'],
      [{ ...other, method: 'bitcoin' }, 'Elige el medio de pago.'],
      [{ ...other, concept: 'collection' }, 'Selecciona la cuenta por cobrar.'],
      [{ ...other, concept: 'collection', receivableId: 'x' }, 'Selecciona la cuenta por cobrar.'],
      [{ ...other, concept: 'payment', payableId: 7 }, 'Selecciona la cuenta por pagar.'],
    ])('rejects %j', async (input, expected) => {
      const { useCases, movements } = setup();
      expect(await businessMessage(useCases.create(input, ADMIN))).toBe(expected);
      expect(movements.rows).toHaveLength(0);
    });
  });

  describe('queries', () => {
    it('lists with the filters and tells whether the list is paged', async () => {
      const { useCases, movements } = setup();
      await useCases.create(other, ADMIN);
      await useCases.create({ ...other, type: 'expense', amount: 10 }, ADMIN);

      const all = await useCases.list({ q: ' sun ' });
      expect(all).toMatchObject({ total: 2, paged: false });
      expect(movements.lastCriteria).toMatchObject({ q: 'sun', order: 'desc' });

      const expenses = await useCases.list({
        type: 'expense',
        accountId: 'ba-1',
        concept: 'other',
        method: 'transfer',
        status: 'posted',
        page: 1,
      });
      expect(expenses.items.map((item) => item.amount)).toEqual([10]);
      expect(expenses.paged).toBe(true);
      expect(movements.lastCriteria).toMatchObject({
        accountId: 'ba-1',
        concept: 'other',
        method: 'transfer',
      });
    });

    it('gets one movement or answers not found', async () => {
      const { useCases } = setup();
      const { id } = await useCases.create(other, ADMIN);
      expect((await useCases.get(id)).number).toBe('MOV-00001');
      expect(await rejection(useCases.get('nope'))).toBeInstanceOf(NotFoundError);
    });
  });

  describe('update', () => {
    it('only changes the notes', async () => {
      const { useCases, audit, balanceOf, movements } = setup();
      const { id } = await useCases.create({ ...other, notes: 'antes' }, ADMIN);
      const updated = await useCases.update(id, { notes: ' después ', amount: 999 }, ADMIN);
      expect(updated).toMatchObject({ notes: 'después', amount: 30 });
      expect((await useCases.update(id, {}, ADMIN)).notes).toBe('después');
      expect(balanceOf('ba-1')).toBe(130);
      expect(movements.locked).toEqual([id, id]);
      expect(audit.actions()).toContain('tesoreria Actualizó MOV-00001');
    });

    it('rejects voided or missing movements', async () => {
      const { useCases } = setup();
      const { id } = await useCases.create(other, ADMIN);
      await useCases.runAction(id, 'void', ADMIN);
      expect(await businessMessage(useCases.update(id, { notes: 'x' }, ADMIN))).toBe(
        'El movimiento está anulado.',
      );
      expect(await rejection(useCases.update('nope', {}, ADMIN))).toBeInstanceOf(NotFoundError);
    });
  });

  describe('void', () => {
    it('reverts the balance of other movements', async () => {
      const { useCases, balanceOf, audit } = setup();
      const { id } = await useCases.create({ ...other, type: 'expense', amount: 25 }, ADMIN);
      expect(balanceOf('ba-1')).toBe(75);
      const voided = await useCases.runAction(id, 'void', ADMIN);
      expect(voided.status).toBe('voided');
      expect(balanceOf('ba-1')).toBe(100);
      expect(audit.actions()).toContain('tesoreria Anuló MOV-00001');
    });

    it('reverts the settled receivable and payable', async () => {
      const { useCases, receivables, payables, balanceOf } = setup();
      const collection = await useCases.create(
        { accountId: 'ba-1', concept: 'collection', receivableId: 'cxc-1', amount: 80 },
        ADMIN,
      );
      const payment = await useCases.create(
        { accountId: 'ba-1', concept: 'payment', payableId: 'cxp-1', amount: 60 },
        ADMIN,
      );
      expect(balanceOf('ba-1')).toBe(120);

      await useCases.runAction(collection.id, 'void', ADMIN);
      await useCases.runAction(payment.id, 'void', ADMIN);
      expect(receivables.balances.get('cxc-1')?.toNumber()).toBe(80);
      expect(payables.balances.get('cxp-1')?.toNumber()).toBe(60);
      expect(balanceOf('ba-1')).toBe(100);
    });

    it('refuses to void an income already spent', async () => {
      const { useCases, balanceOf, movements } = setup();
      const income = await useCases.create({ ...other, amount: 50 }, ADMIN);
      await useCases.create({ ...other, type: 'expense', amount: 140 }, ADMIN);
      expect(await businessMessage(useCases.runAction(income.id, 'void', ADMIN))).toBe(
        'BCP no tiene saldo suficiente.',
      );
      expect(movements.rows[0]?.status).toBe('posted');
      expect(balanceOf('ba-1')).toBe(10);
    });

    it('rejects a second void, unknown actions and missing records', async () => {
      const { useCases, accounts } = setup();
      const { id } = await useCases.create(other, ADMIN);
      expect((await rejection(useCases.runAction(id, 'archive', ADMIN))).message).toBe(
        UNKNOWN_ACTION,
      );
      await useCases.runAction(id, 'void', ADMIN);
      expect(await businessMessage(useCases.runAction(id, 'void', ADMIN))).toBe(
        'El movimiento ya está anulado.',
      );
      expect(await rejection(useCases.runAction('nope', 'void', ADMIN))).toBeInstanceOf(
        NotFoundError,
      );

      const second = await useCases.create(other, ADMIN);
      accounts.accounts.splice(0, 1);
      expect(await businessMessage(useCases.runAction(second.id, 'void', ADMIN))).toBe(
        'Selecciona la cuenta.',
      );
    });

    it('voids movements of an account that became inactive', async () => {
      const { useCases, accounts, balanceOf } = setup();
      const { id } = await useCases.create(other, ADMIN);
      accounts.accounts[0] = { id: 'ba-1', name: 'BCP Soles', status: 'inactive' };
      expect((await useCases.runAction(id, 'void', ADMIN)).status).toBe('voided');
      expect(balanceOf('ba-1')).toBe(100);
    });
  });
});
