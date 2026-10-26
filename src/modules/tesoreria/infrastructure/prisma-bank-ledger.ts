import { Injectable } from '@nestjs/common';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { BankLedger } from '../../../shared/domain/ports/bank-ledger.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';

interface BalanceRow {
  balance: unknown;
}

interface AccountRow {
  name: string;
  balance: unknown;
}

/**
 * The only writer of `bank_accounts.balance`. The conditional UPDATE is atomic and keeps the row
 * locked until the caller's transaction ends, so the balance can never go below zero.
 */
@Injectable()
export class PrismaBankLedger implements BankLedger {
  constructor(private readonly host: PrismaTransactionHost) {}

  async apply(accountId: string, delta: Money): Promise<Money> {
    const amount = delta.toDecimal().toString();
    const client = this.host.client;
    const updated = await client.$queryRaw<BalanceRow[]>`
      UPDATE bank_accounts SET balance = balance + ${amount}::numeric, updated_at = now()
      WHERE id = ${accountId} AND balance + ${amount}::numeric >= 0
      RETURNING balance`;
    if (updated[0]) {
      return Money.of(String(updated[0].balance));
    }

    const accounts = await client.$queryRaw<AccountRow[]>`
      SELECT name, balance FROM bank_accounts WHERE id = ${accountId}`;
    const account = accounts[0];
    if (!account) {
      throw new NotFoundError();
    }
    throw new BusinessError(
      `${account.name} no tiene saldo suficiente (S/ ${Money.of(String(account.balance)).toFixed()}).`,
    );
  }
}
