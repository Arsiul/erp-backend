import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { PrismaPayableLedger } from './prisma-payable-ledger';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  document_number: 'F001-77',
  supplier_name: 'Distribuidora Andina',
  amount: '118.00',
  paid_amount: '0.00',
  balance: '118.00',
  status: 'pending',
  ...overrides,
});

const ledgerWith = (rows: unknown[]) => {
  const client = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    payable: { update: jest.fn().mockResolvedValue({}) },
  };
  const host = { client } as unknown as PrismaTransactionHost;
  return { client, ledger: new PrismaPayableLedger(host) };
};

interface DecimalLike {
  toFixed(digits: number): string;
}

interface UpdateArgs {
  where: unknown;
  data: { paidAmount: DecimalLike; balance: DecimalLike; status: string };
}

type LedgerClient = ReturnType<typeof ledgerWith>['client'];

const queryCall = (client: LedgerClient): unknown[] =>
  (client.$queryRaw.mock.calls as unknown[][])[0] ?? [];
const updateOf = (client: LedgerClient): UpdateArgs | undefined =>
  (client.payable.update.mock.calls as [UpdateArgs][])[0]?.[0];
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('PrismaPayableLedger', () => {
  it('locks the payable, applies the payment and returns the supplier as counterparty', async () => {
    const { client, ledger } = ledgerWith([row()]);

    const result = await ledger.applyPayment('pay-1', Money.of(18));

    expect(sqlOf(queryCall(client))).toContain('FOR UPDATE');
    expect(queryCall(client).slice(1)).toEqual(['pay-1']);
    const update = updateOf(client);
    expect(update?.where).toEqual({ id: 'pay-1' });
    expect(update?.data.paidAmount.toFixed(2)).toBe('18.00');
    expect(update?.data.balance.toFixed(2)).toBe('100.00');
    expect(update?.data.status).toBe('partial');
    expect(result).toMatchObject({
      documentNumber: 'F001-77',
      counterpartyName: 'Distribuidora Andina',
      status: 'partial',
    });
    expect(result.balance.toFixed()).toBe('100.00');
  });

  it('reverts a payment without checks', async () => {
    const { client, ledger } = ledgerWith([
      row({ paid_amount: '118.00', balance: '0.00', status: 'paid' }),
    ]);

    const result = await ledger.revertPayment('pay-1', Money.of(118));

    expect(result.status).toBe('pending');
    expect(result.balance.toFixed()).toBe('118.00');
    expect(updateOf(client)?.data.paidAmount.toFixed(2)).toBe('0.00');
  });

  it('rejects a payment over the balance without writing', async () => {
    const { client, ledger } = ledgerWith([row({ balance: '10.00', paid_amount: '108.00' })]);

    await expect(ledger.applyPayment('pay-1', Money.of(20))).rejects.toThrow(
      new BusinessError('El pago supera el saldo de F001-77 (S/ 10.00).'),
    );
    expect(client.payable.update).not.toHaveBeenCalled();
  });

  it('rejects a cancelled payable', async () => {
    const { ledger } = ledgerWith([row({ balance: '0.00', status: 'cancelled' })]);
    await expect(ledger.applyPayment('pay-1', Money.of(1))).rejects.toThrow(
      'F001-77 no tiene saldo por pagar.',
    );
  });

  it('fails when the payable does not exist', async () => {
    const { ledger } = ledgerWith([]);
    await expect(ledger.revertPayment('missing', Money.of(1))).rejects.toThrow(
      new BusinessError('Selecciona la cuenta por pagar.'),
    );
  });
});
