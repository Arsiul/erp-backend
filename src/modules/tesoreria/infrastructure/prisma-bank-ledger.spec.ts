import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { PrismaBankLedger } from './prisma-bank-ledger';

const ledgerReturning = (...results: unknown[][]) => {
  const $queryRaw = jest.fn();
  results.forEach((rows) => $queryRaw.mockResolvedValueOnce(rows));
  const host = { client: { $queryRaw } } as unknown as PrismaTransactionHost;
  return { $queryRaw, ledger: new PrismaBankLedger(host) };
};

describe('PrismaBankLedger', () => {
  it('applies the delta with a conditional update and returns the new balance', async () => {
    const { $queryRaw, ledger } = ledgerReturning([{ balance: '150.25' }]);

    const balance = await ledger.apply('acc-1', Money.of('-49.75'));

    expect(balance.toFixed()).toBe('150.25');
    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('UPDATE bank_accounts SET balance = balance + ?::numeric');
    expect(sql).toContain('AND balance + ?::numeric >= 0');
    expect(sql).toContain('RETURNING balance');
    expect(values).toEqual(['-49.75', 'acc-1', '-49.75']);
  });

  it('reports the balance before the movement when it is not enough', async () => {
    const { ledger } = ledgerReturning([], [{ name: 'BCP Soles', balance: '20.5' }]);

    const failure = ledger.apply('acc-1', Money.of(-30));

    await expect(failure).rejects.toThrow(BusinessError);
    await expect(failure).rejects.toThrow('BCP Soles no tiene saldo suficiente (S/ 20.50).');
  });

  it('fails with not found when the account does not exist', async () => {
    const { ledger } = ledgerReturning([], []);
    await expect(ledger.apply('missing', Money.of(10))).rejects.toThrow(NotFoundError);
  });
});
