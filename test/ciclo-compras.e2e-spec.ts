import { ApiClient, pick } from './support/ciclos/api-client';
import { addDays } from './support/ciclos/dates';
import { LedgerProbe } from './support/ciclos/ledgers';
import { type Identified, MasterFixtures, type ProductRecord } from './support/ciclos/masters';
import { E2eContext } from './support/e2e-context';

/*
 * Every expected figure comes from the frontend mock (erp-frontend/src/services/mocks/business):
 * documents.ts computeTotals 8-12 and balanceStatus 59-62, stock.ts moveStock 52-85,
 * compras.ts 91-93 (approve), 148-171 (receipt), 212-252 (supplier invoice),
 * tesoreria.ts 26-32 (bank balance) and 134-151 (payment).
 */

interface OrderLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly receivedQuantity: number;
}

interface Order extends Identified {
  readonly number: string;
  readonly status: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
  readonly lines: OrderLine[];
}

interface Receipt {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly subtotal: number;
  readonly supplierInvoiceNumber: string;
}

interface SupplierInvoice {
  readonly id: string;
  readonly documentNumber: string;
  readonly status: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
  readonly issuedAt: string;
  readonly dueAt: string;
}

interface Payable {
  readonly id: string;
  readonly documentNumber: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly balance: number;
  readonly status: string;
}

interface Movement {
  readonly id: string;
  readonly number: string;
  readonly type: string;
  readonly concept: string;
  readonly counterparty: string;
  readonly reference: string;
  readonly method: string;
  readonly amount: number;
  readonly status: string;
}

jest.setTimeout(120_000);

describe('Ciclo de compras (e2e)', () => {
  let ctx: E2eContext;
  let api: ApiClient;
  let treasury: ApiClient;
  let ledgers: LedgerProbe;
  let warehouse: Identified;
  let supplier: Identified;
  let bolts: ProductRecord;
  let nuts: ProductRecord;
  let account: Identified;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    api = new ApiClient(ctx, await ctx.tokenFor('role-compras'));
    treasury = new ApiClient(ctx, await ctx.tokenFor('role-tesoreria'));
    const admin = new ApiClient(ctx, await ctx.tokenFor('role-admin'));
    ledgers = new LedgerProbe(ctx);
    const masters = new MasterFixtures(api);

    warehouse = await masters.warehouse();
    const category = await masters.category();
    bolts = await masters.product(category.id, { salePrice: 20, costPrice: 10 });
    nuts = await masters.product(category.id, { salePrice: 12, costPrice: 4 });
    supplier = await masters.supplier(30);
    account = await new MasterFixtures(admin).bankAccount(1000);
    await masters.stock(bolts.id, warehouse.id, 5);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('runs an order through receipt, supplier invoice, payable and payments', async () => {
    const draft = await api.create<Order>('ordenes-compra', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      issuedAt: '2026-10-01',
      lines: [
        { productId: bolts.id, quantity: 10, unitPrice: 12.5 },
        { productId: nuts.id, quantity: 4, unitPrice: 8 },
      ],
    });
    // computeTotals: 10·12.50 + 4·8.00 = 157.00; IGV round2(157·0.18) = 28.26; total 185.26.
    expect(draft).toMatchObject({ status: 'draft', subtotal: 157, igv: 28.26, total: 185.26 });

    const approved = await api.act<Order>('ordenes-compra', draft.id, 'approve');
    expect(approved.status).toBe('approved');
    const again = await api.rejected(api.post(`/ordenes-compra/${draft.id}/approve`));
    expect(again).toMatchObject({
      code: 'BUSINESS_RULE',
      message: 'Solo se aprueban órdenes en borrador.',
    });
    expect(await ledgers.quantity(bolts.id, warehouse.id)).toBe(5);

    const receipt = await api.create<Receipt>('recepciones', {
      purchaseOrderId: draft.id,
      guideNumber: 'T001-000123',
      receivedAt: '2026-10-03',
      lines: [
        { productId: bolts.id, quantity: 10 },
        { productId: nuts.id, quantity: 4 },
      ],
    });
    // compras.ts 171: receipt subtotal = computeTotals(lines, 0).subtotal at the order prices.
    expect(receipt).toMatchObject({ status: 'pending_bill', subtotal: 157 });

    // stock.ts 62-67: weighted average round2((10·12.50 + 5·10.00) / 15) = 11.67.
    expect(await ledgers.stock(bolts.id, warehouse.id)).toEqual({ quantity: 15, unitCost: 11.67 });
    // A product without stock row starts at its own cost (stock.ts 31) and takes the receipt cost.
    expect(await ledgers.stock(nuts.id, warehouse.id)).toEqual({ quantity: 4, unitCost: 8 });
    // stock.ts 71-83: the entry keeps the movement cost; compras.ts 157 updates the product cost.
    expect(await ledgers.kardex(bolts.id, receipt.number)).toEqual([
      { origin: 'receipt', quantity: 10, balance: 15, unitCost: 12.5 },
    ]);
    expect(await ledgers.kardex(nuts.id, receipt.number)).toEqual([
      { origin: 'receipt', quantity: 4, balance: 4, unitCost: 8 },
    ]);
    expect(await ledgers.productCost(bolts.id)).toBe(12.5);
    expect(await ledgers.productCost(nuts.id)).toBe(8);

    const received = await api.one<Order>('ordenes-compra', draft.id);
    expect(received.status).toBe('received');
    expect(received.lines.map((line) => line.receivedQuantity)).toEqual([10, 4]);
    const late = await api.rejected(
      api.post('/recepciones', {
        purchaseOrderId: draft.id,
        lines: [{ productId: bolts.id, quantity: 1 }],
      }),
    );
    expect(late.message).toBe(
      `La orden ${draft.number} no está aprobada o ya se recibió completa.`,
    );

    const invoice = await api.create<SupplierInvoice>('facturas-proveedor', {
      documentNumber: 'f001-501',
      receiptId: receipt.id,
      issuedAt: '2026-10-05',
    });
    // compras.ts 244-251: totals from the receipt subtotal; due date = issue + paymentDays (30).
    expect(invoice).toMatchObject({
      documentNumber: 'F001-501',
      status: 'registered',
      subtotal: 157,
      igv: 28.26,
      total: 185.26,
      dueAt: addDays('2026-10-05', 30),
    });
    expect(await api.one<Receipt>('recepciones', receipt.id)).toMatchObject({
      status: 'billed',
      supplierInvoiceNumber: 'F001-501',
    });
    const billedTwice = await api.rejected(
      api.post('/facturas-proveedor', { documentNumber: 'F001-502', receiptId: receipt.id }),
    );
    expect(billedTwice.message).toBe(
      `La recepción ${receipt.number} ya fue facturada o está anulada.`,
    );

    const payables = await api.list<Payable>(`/cuentas-pagar?supplierId=${supplier.id}`);
    expect(payables).toHaveLength(1);
    const payable = pick(payables, () => true, 'la cuenta por pagar');
    expect(payable).toMatchObject({
      documentNumber: 'F001-501',
      amount: 185.26,
      paidAmount: 0,
      balance: 185.26,
      status: 'pending',
    });

    const first = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'payment',
      payableId: payable.id,
      amount: 85.26,
    });
    // tesoreria.ts 134-151 and 166-168: expense to the supplier, reference = document, transfer.
    expect(first).toMatchObject({
      type: 'expense',
      concept: 'payment',
      counterparty: supplier.name,
      reference: 'F001-501',
      method: 'transfer',
      amount: 85.26,
      status: 'posted',
    });
    expect(first.number).toMatch(/^MOV-\d{5}$/);
    expect(await ledgers.bank(account.id)).toBe(914.74);
    expect(await treasury.one<Payable>('cuentas-pagar', payable.id)).toMatchObject({
      paidAmount: 85.26,
      balance: 100,
      status: 'partial',
    });

    const over = await treasury.rejected(
      treasury.post('/movimientos', {
        accountId: account.id,
        concept: 'payment',
        payableId: payable.id,
        amount: 100.01,
      }),
    );
    expect(over.message).toBe('El pago supera el saldo de F001-501 (S/ 100.00).');

    await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'payment',
      payableId: payable.id,
      amount: 100,
    });
    expect(await ledgers.bank(account.id)).toBe(814.74);
    expect(await treasury.one<Payable>('cuentas-pagar', payable.id)).toMatchObject({
      paidAmount: 185.26,
      balance: 0,
      status: 'paid',
    });
    const settled = await treasury.rejected(
      treasury.post('/movimientos', {
        accountId: account.id,
        concept: 'payment',
        payableId: payable.id,
        amount: 1,
      }),
    );
    expect(settled.message).toBe('F001-501 no tiene saldo por pagar.');
    expect(await ledgers.bank(account.id)).toBe(814.74);
  });

  it('refuses a payment the bank account cannot cover and leaves the payable untouched', async () => {
    const order = await api.create<Order>('ordenes-compra', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      issuedAt: '2026-10-01',
      lines: [{ productId: nuts.id, quantity: 100, unitPrice: 9.99 }],
    });
    await api.act('ordenes-compra', order.id, 'approve');
    const receipt = await api.create<Receipt>('recepciones', {
      purchaseOrderId: order.id,
      guideNumber: 'T001-000900',
      receivedAt: '2026-10-03',
      lines: [{ productId: nuts.id, quantity: 100 }],
    });
    // stock.ts 62-67: round2((100·9.99 + 4·8.00) / 104) = 9.91.
    expect(await ledgers.stock(nuts.id, warehouse.id)).toEqual({ quantity: 104, unitCost: 9.91 });

    await api.create('facturas-proveedor', {
      documentNumber: 'F001-900',
      receiptId: receipt.id,
      issuedAt: '2026-10-05',
    });
    const payable = (await api.list<Payable>(`/cuentas-pagar?supplierId=${supplier.id}`)).find(
      (row) => row.documentNumber === 'F001-900',
    );
    // 999.00 + round2(999·0.18) = 999.00 + 179.82 = 1178.82.
    expect(payable).toMatchObject({ amount: 1178.82, balance: 1178.82, status: 'pending' });
    const bank = await ledgers.bank(account.id);

    const refused = await treasury.rejected(
      treasury.post('/movimientos', {
        accountId: account.id,
        concept: 'payment',
        payableId: payable?.id,
        amount: 1000,
      }),
    );
    expect(refused.message).toBe(
      `${account.name} no tiene saldo suficiente (S/ ${bank.toFixed(2)}).`,
    );
    expect(await ledgers.bank(account.id)).toBe(bank);
    expect(await treasury.one<Payable>('cuentas-pagar', payable?.id ?? '')).toMatchObject({
      paidAmount: 0,
      balance: 1178.82,
      status: 'pending',
    });
  });
});
