import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { Money } from '../../../shared/domain/money/money';
import type {
  StockBalance,
  StockLedger,
  StockMovement,
} from '../../../shared/domain/ports/stock-ledger.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';

interface LockedStockRow {
  id: string;
  quantity: number;
  unit_cost: unknown;
  product_name: string;
  sku: string;
  unit: string;
  warehouse_name: string;
}

/**
 * The only writer of `stock_items.quantity` and `kardex_entries`. Runs on the caller's transaction;
 * the `FOR UPDATE` lock serializes concurrent movements of the same product and warehouse.
 */
@Injectable()
export class PrismaStockLedger implements StockLedger {
  constructor(private readonly host: PrismaTransactionHost) {}

  async move(movement: StockMovement): Promise<StockBalance> {
    const row = await this.lockRow(movement.productId, movement.warehouseId);
    const current = Money.of(String(row.unit_cost));
    const balance = row.quantity + movement.quantity;
    if (balance < 0) {
      throw new BusinessError(
        `Stock insuficiente de ${row.product_name} en ${row.warehouse_name}: hay ${String(row.quantity)} ${row.unit}.`,
      );
    }

    const entryCost = movement.quantity > 0 ? movement.unitCost : undefined;
    const unitCost = entryCost
      ? averageCost(row.quantity, current, movement.quantity, entryCost)
      : current;

    const client = this.host.client;
    await client.stockItem.update({
      where: { id: row.id },
      data: { quantity: balance, unitCost: unitCost.toDecimal() },
    });
    await client.kardexEntry.create({
      data: {
        date: new Date(`${movement.date}T00:00:00Z`),
        productId: movement.productId,
        productName: row.product_name,
        sku: row.sku,
        warehouseId: movement.warehouseId,
        warehouseName: row.warehouse_name,
        origin: movement.origin,
        reference: movement.reference,
        quantity: movement.quantity,
        balance,
        unitCost: (entryCost ?? unitCost).toDecimal(),
      },
    });
    return { quantity: balance, unitCost };
  }

  async initializeForProduct(productId: string): Promise<void> {
    await this.host.client.$executeRaw`
      INSERT INTO stock_items (id, product_id, warehouse_id, quantity, min_stock, unit_cost, updated_at)
      SELECT gen_random_uuid()::text, p.id, w.id, 0, p.min_stock, p.cost_price, now()
      FROM products p CROSS JOIN warehouses w
      WHERE p.id = ${productId} AND w.status = 'active'
      ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
  }

  async initializeForWarehouse(warehouseId: string): Promise<void> {
    await this.host.client.$executeRaw`
      INSERT INTO stock_items (id, product_id, warehouse_id, quantity, min_stock, unit_cost, updated_at)
      SELECT gen_random_uuid()::text, p.id, w.id, 0, p.min_stock, p.cost_price, now()
      FROM products p CROSS JOIN warehouses w
      WHERE w.id = ${warehouseId}
      ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
  }

  /** Creates the row lazily (quantity 0, product min stock and cost) and locks it. */
  private async lockRow(productId: string, warehouseId: string): Promise<LockedStockRow> {
    const client = this.host.client;
    await client.$executeRaw`
      INSERT INTO stock_items (id, product_id, warehouse_id, quantity, min_stock, unit_cost, updated_at)
      SELECT gen_random_uuid()::text, p.id, w.id, 0, p.min_stock, p.cost_price, now()
      FROM products p CROSS JOIN warehouses w
      WHERE p.id = ${productId} AND w.id = ${warehouseId}
      ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
    const rows = await client.$queryRaw<LockedStockRow[]>`
      SELECT s.id, s.quantity, s.unit_cost, p.name AS product_name, p.sku, p.unit,
             w.name AS warehouse_name
      FROM stock_items s
      JOIN products p ON p.id = s.product_id
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = ${productId} AND s.warehouse_id = ${warehouseId}
      FOR UPDATE OF s`;
    const row = rows[0];
    if (!row) {
      throw new BusinessError('El producto o el almacén ya no existe.');
    }
    return row;
  }
}

/** Weighted average cost after a positive entry, rounded to cents. */
function averageCost(quantity: number, cost: Money, entry: number, entryCost: Money): Money {
  return Money.of(
    cost
      .times(quantity)
      .plus(entryCost.times(entry))
      .toDecimal()
      .div(quantity + entry),
  );
}
