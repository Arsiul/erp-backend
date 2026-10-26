import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { PrismaReceivableLedger } from './prisma-receivable-ledger';

const row = (overrides: object = {}) => ({
  id: 'rec-1',
  document_number: 'F001-00000001',
  customer_name: 'Comercial Andina S.A.C.',
  amount: '590.00',
  paid_amount: '0.00',
  balance: '590.00',
  status: 'pending',
  ...overrides,
});

const ledgerWith = (rows: unknown[]) => {
  const $queryRaw = jest.fn().mockResolvedValue(rows);
  const update = jest.fn().mockResolvedValue({});
  const host = {
    client: { $queryRaw, receivable: { update } },
  } as unknown as PrismaTransactionHost;
  return { $queryRaw, update, ledger: new PrismaReceivableLedger(host) };
};

const updateData = (update: jest.Mock) => {
  const [args] = update.mock.calls[0] as [
    { where: { id: string }; data: { paidAmount: unknown; balance: unknown; status: string } },
  ];
  return {
    id: args.where.id,
    paidAmount: String(args.data.paidAmount),
    balance: String(args.data.balance),
    status: args.data.status,
  };
};

describe('PrismaReceivableLedger', () => {
  it('locks the row with a parameterized SELECT … FOR UPDATE', async () => {
    const { $queryRaw, ledger } = ledgerWith([row()]);

    await ledger.applyPayment('rec-1', Money.of(100));

    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(values).toEqual(['rec-1']);
    expect(sql).toContain('FROM receivables');
    expect(sql).toContain('WHERE id = ?');
    expect(sql).toContain('FOR UPDATE');
  });

  it('applies a partial payment', async () => {
    const { update, ledger } = ledgerWith([row()]);

    const result = await ledger.applyPayment('rec-1', Money.of(90.5));

    expect(updateData(update)).toEqual({
      id: 'rec-1',
      paidAmount: '90.5',
      balance: '499.5',
      status: 'partial',
    });
    expect(result).toEqual({
      documentNumber: 'F001-00000001',
      counterpartyName: 'Comercial Andina S.A.C.',
      balance: Money.of(499.5),
      status: 'partial',
    });
  });

  it('marks the receivable paid when the payment covers the balance', async () => {
    const { update, ledger } = ledgerWith([row({ paid_amount: '90.00', balance: '500.00' })]);

    const result = await ledger.applyPayment('rec-1', Money.of(500));

    expect(updateData(update)).toMatchObject({ paidAmount: '590', balance: '0', status: 'paid' });
    expect(result.status).toBe('paid');
    expect(result.balance.toNumber()).toBe(0);
  });

  it('rejects a payment above the balance', async () => {
    const { update, ledger } = ledgerWith([row({ balance: '100.00' })]);

    await expect(ledger.applyPayment('rec-1', Money.of(100.01))).rejects.toThrow(
      new BusinessError('El cobro supera el saldo de F001-00000001 (S/ 100.00).'),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['cancelled', row({ status: 'cancelled', balance: '0.00' })],
    ['paid', row({ status: 'paid', paid_amount: '590.00', balance: '0.00' })],
  ])('rejects a payment on a %s receivable', async (_status, locked) => {
    const { update, ledger } = ledgerWith([locked]);

    await expect(ledger.applyPayment('rec-1', Money.of(1))).rejects.toThrow(
      new BusinessError('F001-00000001 no tiene saldo por cobrar.'),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an unknown receivable', async () => {
    const { ledger } = ledgerWith([]);

    await expect(ledger.applyPayment('missing', Money.of(1))).rejects.toThrow(
      new BusinessError('Selecciona la cuenta por cobrar.'),
    );
    await expect(ledger.revertPayment('missing', Money.of(1))).rejects.toThrow(BusinessError);
  });

  it('reverts a payment and recalculates the status', async () => {
    const { $queryRaw, update, ledger } = ledgerWith([
      row({ status: 'paid', paid_amount: '590.00', balance: '0.00' }),
    ]);

    const result = await ledger.revertPayment('rec-1', Money.of(90));

    expect(String(($queryRaw.mock.calls[0] as string[][])[0])).toContain('FOR UPDATE');
    expect(updateData(update)).toEqual({
      id: 'rec-1',
      paidAmount: '500',
      balance: '90',
      status: 'partial',
    });
    expect(result).toMatchObject({ balance: Money.of(90), status: 'partial' });
  });

  it('reverts the only payment back to pending', async () => {
    const { ledger } = ledgerWith([
      row({ paid_amount: '590.00', balance: '0.00', status: 'paid' }),
    ]);

    await expect(ledger.revertPayment('rec-1', Money.of(590))).resolves.toMatchObject({
      status: 'pending',
    });
  });
});
