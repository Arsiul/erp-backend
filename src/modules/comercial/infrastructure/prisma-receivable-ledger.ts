import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { balanceStatus } from '../../../shared/domain/money/balance-status';
import { Money } from '../../../shared/domain/money/money';
import type { ReceivableLedger } from '../../../shared/domain/ports/receivable-ledger.port';
import type { SettlementResult } from '../../../shared/domain/ports/settlement';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';

interface LockedReceivableRow {
  id: string;
  document_number: string;
  customer_name: string;
  amount: unknown;
  paid_amount: unknown;
  balance: unknown;
  status: string;
}

interface LockedReceivable {
  readonly id: string;
  readonly documentNumber: string;
  readonly customerName: string;
  readonly amount: Money;
  readonly paidAmount: Money;
  readonly balance: Money;
  readonly cancelled: boolean;
}

const MISSING_RECEIVABLE = 'Selecciona la cuenta por cobrar.';

/**
 * Collections on accounts receivable. Runs on the caller's transaction; the `FOR UPDATE` lock
 * serializes concurrent payments on the same receivable, so the balance never goes below zero.
 */
@Injectable()
export class PrismaReceivableLedger implements ReceivableLedger {
  constructor(private readonly host: PrismaTransactionHost) {}

  async applyPayment(receivableId: string, amount: Money): Promise<SettlementResult> {
    const row = await this.lock(receivableId);
    if (row.cancelled || !row.balance.isPositive()) {
      throw new BusinessError(`${row.documentNumber} no tiene saldo por cobrar.`);
    }
    if (amount.greaterThan(row.balance)) {
      throw new BusinessError(
        `El cobro supera el saldo de ${row.documentNumber} (S/ ${row.balance.toFixed()}).`,
      );
    }
    return this.settle(row, row.paidAmount.plus(amount), row.balance.minus(amount));
  }

  async revertPayment(receivableId: string, amount: Money): Promise<SettlementResult> {
    const row = await this.lock(receivableId);
    return this.settle(row, row.paidAmount.minus(amount), row.balance.plus(amount));
  }

  private async lock(receivableId: string): Promise<LockedReceivable> {
    const rows = await this.host.client.$queryRaw<LockedReceivableRow[]>`
      SELECT id, document_number, customer_name, amount, paid_amount, balance, status::text AS status
      FROM receivables
      WHERE id = ${receivableId}
      FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) {
      throw new BusinessError(MISSING_RECEIVABLE);
    }
    return {
      id: row.id,
      documentNumber: row.document_number,
      customerName: row.customer_name,
      amount: Money.of(String(row.amount)),
      paidAmount: Money.of(String(row.paid_amount)),
      balance: Money.of(String(row.balance)),
      cancelled: row.status === 'cancelled',
    };
  }

  private async settle(
    row: LockedReceivable,
    paidAmount: Money,
    balance: Money,
  ): Promise<SettlementResult> {
    const status = balanceStatus(row.amount, balance);
    await this.host.client.receivable.update({
      where: { id: row.id },
      data: { paidAmount: paidAmount.toDecimal(), balance: balance.toDecimal(), status },
    });
    return {
      documentNumber: row.documentNumber,
      counterpartyName: row.customerName,
      balance,
      status,
    };
  }
}
