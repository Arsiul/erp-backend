import type { PurchaseOrderRecord } from '../domain/purchase-order';
import { receivedProgress } from '../domain/purchase-order-rules';
import type {
  PurchaseOrderRepository,
  ReceiptRepository,
} from '../domain/ports/purchasing.repositories';
import { receivedByProduct } from '../domain/receipt-rules';

/**
 * Rewrites what each line of the order received from its receipts in force and the resulting
 * status (`approved`, `partial` or `received`). The order must already be locked.
 */
export async function refreshOrderProgress(
  orders: PurchaseOrderRepository,
  receipts: ReceiptRepository,
  order: PurchaseOrderRecord,
): Promise<PurchaseOrderRecord> {
  const progress = receivedProgress(order, receivedByProduct(await receipts.listByOrder(order.id)));
  return orders.setProgress(order.id, progress.lines, progress.status);
}
