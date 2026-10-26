import { SETTINGS_ID } from '../../../shared/infrastructure/prisma/settings-row';
import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  CommercialSettings,
  CustomerRef,
  ProductRef,
  WarehouseRef,
} from '../domain/commercial';
import type { CommercialLookups } from '../domain/ports/commercial-lookups.port';
import { amountOf } from '../../../shared/infrastructure/prisma/decimal-columns';

/** The company settings live in the single row with id 1. */

@Injectable()
export class PrismaCommercialLookups implements CommercialLookups {
  constructor(private readonly host: PrismaTransactionHost) {}

  async customer(id: string, forUpdate = false): Promise<CustomerRef | null> {
    if (forUpdate) {
      await this.host.client.$queryRaw`SELECT id FROM customers WHERE id = ${id} FOR UPDATE`;
    }
    const row = await this.host.client.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        documentType: true,
        documentNumber: true,
        creditDays: true,
        creditLimit: true,
        status: true,
      },
    });
    return row ? { ...row, creditLimit: amountOf(row.creditLimit) } : null;
  }

  async warehouse(id: string): Promise<WarehouseRef | null> {
    return this.host.client.warehouse.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  }

  async products(ids: readonly string[]): Promise<ReadonlyMap<string, ProductRef>> {
    const rows = await this.host.client.product.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, sku: true, salePrice: true },
    });
    return new Map(rows.map((row) => [row.id, { ...row, salePrice: amountOf(row.salePrice) }]));
  }

  async settings(): Promise<CommercialSettings> {
    const row = await this.host.client.settings.findUnique({
      where: { id: SETTINGS_ID },
      select: {
        igvRate: true,
        invoiceSeries: true,
        receiptSeries: true,
        creditNoteSeries: true,
        quoteValidityDays: true,
      },
    });
    if (!row) {
      throw new BusinessError('Registra la configuración de la empresa antes de continuar.');
    }
    return { ...row, igvRate: row.igvRate.toString() };
  }

  async exposure(customerId: string, exceptSaleId?: string): Promise<number> {
    const [receivables, sales] = await Promise.all([
      this.host.client.receivable.aggregate({
        where: { customerId, status: { not: 'cancelled' } },
        _sum: { balance: true },
      }),
      this.host.client.sale.aggregate({
        where: {
          customerId,
          paymentTerm: 'credit',
          status: 'pending_invoice',
          ...(exceptSaleId === undefined ? {} : { id: { not: exceptSaleId } }),
        },
        _sum: { total: true },
      }),
    ]);
    return Money.of(receivables._sum.balance ?? 0)
      .plus(Money.of(sales._sum.total ?? 0))
      .toNumber();
  }

  async creditedQuantities(invoiceId: string): Promise<ReadonlyMap<string, number>> {
    const rows = await this.host.client.creditNoteLine.groupBy({
      by: ['productId'],
      where: { creditNote: { invoiceId } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
  }
}
