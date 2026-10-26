import type { E2eContext } from '../e2e-context';

export interface StockSnapshot {
  readonly quantity: number;
  readonly unitCost: number;
}

export interface KardexSnapshot {
  readonly origin: string;
  readonly quantity: number;
  readonly balance: number;
  readonly unitCost: number;
}

/** Reads the persisted effects (stock, kardex, bank) straight from the database. */
export class LedgerProbe {
  constructor(private readonly ctx: E2eContext) {}

  async stock(productId: string, warehouseId: string): Promise<StockSnapshot> {
    const row = await this.ctx.prisma.stockItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return { quantity: row.quantity, unitCost: Number(row.unitCost) };
  }

  async quantity(productId: string, warehouseId: string): Promise<number> {
    return (await this.stock(productId, warehouseId)).quantity;
  }

  async productCost(productId: string): Promise<number> {
    const product = await this.ctx.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    return Number(product.costPrice);
  }

  async kardex(productId: string, reference: string): Promise<KardexSnapshot[]> {
    const rows = await this.ctx.prisma.kardexEntry.findMany({
      where: { productId, reference },
      orderBy: { seq: 'asc' },
    });
    return rows.map((row) => ({
      origin: row.origin,
      quantity: row.quantity,
      balance: row.balance,
      unitCost: Number(row.unitCost),
    }));
  }

  async bank(accountId: string): Promise<number> {
    const account = await this.ctx.prisma.bankAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    return Number(account.balance);
  }
}
