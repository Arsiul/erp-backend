import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import { applyPaymentTo, type PayableBalance, revertPaymentFrom } from './payable-settlement';

const payable = (overrides: Partial<PayableBalance> = {}): PayableBalance => ({
  documentNumber: 'F001-123',
  amount: Money.of(118),
  paidAmount: Money.zero(),
  balance: Money.of(118),
  status: 'pending',
  ...overrides,
});

describe('payable settlement', () => {
  it('applies a partial payment and then the rest', () => {
    const partial = applyPaymentTo(payable(), Money.of('18.50'));
    expect(partial.paidAmount.toFixed()).toBe('18.50');
    expect(partial.balance.toFixed()).toBe('99.50');
    expect(partial.status).toBe('partial');

    const paid = applyPaymentTo(
      payable({ paidAmount: partial.paidAmount, balance: partial.balance, status: 'partial' }),
      Money.of('99.50'),
    );
    expect(paid.balance.isZero()).toBe(true);
    expect(paid.status).toBe('paid');
  });

  it('rejects a payment over the balance', () => {
    expect(() => applyPaymentTo(payable({ balance: Money.of('50.5') }), Money.of(60))).toThrow(
      new BusinessError('El pago supera el saldo de F001-123 (S/ 50.50).'),
    );
  });

  it.each([
    ['cancelled', payable({ status: 'cancelled', balance: Money.zero() })],
    ['paid', payable({ status: 'paid', balance: Money.zero(), paidAmount: Money.of(118) })],
  ])('rejects a payment on a %s payable', (_label, current) => {
    expect(() => applyPaymentTo(current, Money.of(1))).toThrow(
      new BusinessError('F001-123 no tiene saldo por pagar.'),
    );
  });

  it('reverts a payment back to pending or partial', () => {
    const paid = payable({ paidAmount: Money.of(118), balance: Money.zero(), status: 'paid' });
    const partial = revertPaymentFrom(paid, Money.of(18));
    expect(partial.paidAmount.toFixed()).toBe('100.00');
    expect(partial.balance.toFixed()).toBe('18.00');
    expect(partial.status).toBe('partial');

    const pending = revertPaymentFrom(paid, Money.of(118));
    expect(pending.paidAmount.isZero()).toBe(true);
    expect(pending.status).toBe('pending');
  });
});
