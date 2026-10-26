import { Money } from '../src/shared/domain/money/money';
import { BANK_LEDGER, type BankLedger } from '../src/shared/domain/ports/bank-ledger.port';
import { LedgerHarness } from './support/inventario/ledger-harness';

describe('BankLedger adapter (e2e)', () => {
  let harness: LedgerHarness;
  let ledger: BankLedger;

  const apply = (delta: number | string) =>
    harness.uow.run(() => ledger.apply('acc-1', Money.of(delta)));

  const balance = async () =>
    (
      await harness.prisma.bankAccount.findUniqueOrThrow({ where: { id: 'acc-1' } })
    ).balance.toFixed(2);

  beforeAll(async () => {
    harness = await LedgerHarness.start();
    ledger = harness.get(BANK_LEDGER) as BankLedger;
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.prisma.bankAccount.create({
      data: {
        id: 'acc-1',
        bank: 'BCP',
        name: 'BCP Soles',
        accountNumber: '191-0000001',
        openingBalance: 100,
        balance: 100,
      },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('adds and subtracts amounts and returns the new balance', async () => {
    await expect(apply('50.25')).resolves.toEqual(Money.of('150.25'));
    await expect(apply('-150.25')).resolves.toEqual(Money.of(0));
    expect(await balance()).toBe('0.00');
  });

  it('rejects a debit larger than the balance with the balance before the movement', async () => {
    await expect(apply(-100.01)).rejects.toThrow(
      'BCP Soles no tiene saldo suficiente (S/ 100.00).',
    );
    expect(await balance()).toBe('100.00');
  });

  it('rolls back with the unit of work of the caller', async () => {
    await expect(
      harness.uow.run(async () => {
        await ledger.apply('acc-1', Money.of(-60));
        await ledger.apply('acc-1', Money.of(-60));
      }),
    ).rejects.toThrow('BCP Soles no tiene saldo suficiente (S/ 40.00).');
    expect(await balance()).toBe('100.00');
  });

  it('serializes concurrent debits so the balance never goes negative', async () => {
    const results = await Promise.allSettled([apply(-70), apply(-70)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await balance()).toBe('30.00');
  });

  it('fails with not found for an unknown account', async () => {
    await expect(harness.uow.run(() => ledger.apply('missing', Money.of(1)))).rejects.toThrow(
      'El registro ya no existe.',
    );
  });
});
