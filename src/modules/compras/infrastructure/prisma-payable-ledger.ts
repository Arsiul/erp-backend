import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type { PayableLedger } from '../../../shared/domain/ports/payable-ledger.port';
import type { SettlementResult } from '../../../shared/domain/ports/settlement';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import {
  applyPaymentTo,
  type PayableBalance,
  type PayableStatus,
  revertPaymentFrom,
  type SettledPayable,
} from '../domain/payable-settlement';

interface LockedPayableRow {
  readonly id: string;
  readonly document_number: string;
  readonly supplier_name: string;
  readonly amount: unknown;
  readonly paid_amount: unknown;
  readonly balance: unknown;
  readonly status: PayableStatus;
}

interface LockedPayable extends PayableBalance {
  readonly id: string;
  readonly supplierName: string;
}

/**
 * PAYABLE_LEDGER over the `payables` table. Each call locks the row (`FOR UPDATE`) inside the
 * caller's transaction, so two concurrent payments of the same payable never read the same balance.
 */
@Injectable()
export class PrismaPayableLedger implements PayableLedger {
  constructor(private readonly host: PrismaTransactionHost) {}

  async applyPayment(payableId: string, amount: Money): Promise<SettlementResult> {
    const payable = await this.lock(payableId);
    return this.save(payable, applyPaymentTo(payable, amount));
  }

  async revertPayment(payableId: string, amount: Money): Promise<SettlementResult> {
    const payable = await this.lock(payableId);
    return this.save(payable, revertPaymentFrom(payable, amount));
  }

  private async lock(payableId: string): Promise<LockedPayable> {
    const rows = await this.host.client.$queryRaw<LockedPayableRow[]>`
      SELECT id, document_number, supplier_name, amount, paid_amount, balance, status::text AS status
      FROM payables
      WHERE id = ${payableId}
      FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) {
      throw new BusinessError('Selecciona la cuenta por pagar.');
    }
    return {
      id: row.id,
      documentNumber: row.document_number,
      supplierName: row.supplier_name,
      amount: Money.of(String(row.amount)),
      paidAmount: Money.of(String(row.paid_amount)),
      balance: Money.of(String(row.balance)),
      status: row.status,
    };
  }

  private async save(payable: LockedPayable, settled: SettledPayable): Promise<SettlementResult> {
    await this.host.client.payable.update({
      where: { id: payable.id },
      data: {
        paidAmount: settled.paidAmount.toDecimal(),
        balance: settled.balance.toDecimal(),
        status: settled.status,
      },
    });
    return {
      documentNumber: payable.documentNumber,
      counterpartyName: payable.supplierName,
      balance: settled.balance,
      status: settled.status,
    };
  }
}
