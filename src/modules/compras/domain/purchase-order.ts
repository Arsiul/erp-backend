import type { Money } from '../../../shared/domain/money/money';
import { type DocumentLine, type DocumentLineView, toLineView } from './purchase-lines';

export type PurchaseOrderStatus = 'draft' | 'approved' | 'partial' | 'received' | 'cancelled';

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'approved',
  'partial',
  'received',
  'cancelled',
] as const satisfies readonly PurchaseOrderStatus[];

/** An ordered line and how much of it the receipts in force already brought. */
export interface PurchaseLine extends DocumentLine {
  readonly receivedQuantity: number;
}

export interface PurchaseLineView extends DocumentLineView {
  readonly receivedQuantity: number;
}

/** What a create or an edit writes; lines start with nothing received. */
export interface PurchaseOrderValues {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly issuedAt: string;
  readonly expectedAt: string;
  readonly lines: readonly DocumentLine[];
  readonly subtotal: Money;
  readonly igv: Money;
  readonly total: Money;
  readonly notes: string;
}

export interface PurchaseOrderRecord extends Omit<PurchaseOrderValues, 'lines'> {
  readonly id: string;
  readonly number: string;
  readonly lines: readonly PurchaseLine[];
  readonly status: PurchaseOrderStatus;
}

export interface PurchaseOrderView {
  readonly id: string;
  readonly number: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly issuedAt: string;
  readonly expectedAt: string;
  readonly lines: readonly PurchaseLineView[];
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
  readonly status: PurchaseOrderStatus;
  readonly notes: string;
}

export const toPurchaseOrderView = (order: PurchaseOrderRecord): PurchaseOrderView => ({
  id: order.id,
  number: order.number,
  supplierId: order.supplierId,
  supplierName: order.supplierName,
  warehouseId: order.warehouseId,
  warehouseName: order.warehouseName,
  issuedAt: order.issuedAt,
  expectedAt: order.expectedAt,
  lines: order.lines.map((line) => ({
    ...toLineView(line),
    receivedQuantity: line.receivedQuantity,
  })),
  subtotal: order.subtotal.toNumber(),
  igv: order.igv.toNumber(),
  total: order.total.toNumber(),
  status: order.status,
  notes: order.notes,
});
