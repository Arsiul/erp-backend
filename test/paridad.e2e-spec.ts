import { ApiClient, pick } from './support/ciclos/api-client';
import { LedgerProbe } from './support/ciclos/ledgers';
import { type Identified, MasterFixtures, type ProductRecord } from './support/ciclos/masters';
import { E2eContext } from './support/e2e-context';

/*
 * Decimal and rounding parity with the frontend mock (erp-frontend/src/services/mocks/business).
 * Each expected figure cites the frontend line that produces it: context.ts 40-41 (round2),
 * documents.ts 8-12 (computeTotals), 14-17 (totalsFromSubtotal), 53 (line price), stock.ts 62-67
 * (weighted average), 80-81 (kardex cost), tesoreria.ts 97 (movement amount), 124-128 and
 * 142-146 (balances) and comercial.ts 358-407 (credit note).
 */

interface Line {
  readonly unitPrice: number;
}

interface Totals extends Identified {
  readonly number: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
  readonly lines: Line[];
}

interface Account {
  readonly id: string;
  readonly documentNumber: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly creditedAmount?: number;
  readonly balance: number;
  readonly status: string;
}

interface Movement {
  readonly amount: number;
}

jest.setTimeout(120_000);

describe('Paridad de decimales y redondeo con el mock del frontend (e2e)', () => {
  let ctx: E2eContext;
  let purchases: ApiClient;
  let sales: ApiClient;
  let treasury: ApiClient;
  let ledgers: LedgerProbe;
  let masters: MasterFixtures;
  let warehouse: Identified;
  let categoryId: string;
  let supplier: Identified;
  let account: Identified;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    purchases = new ApiClient(ctx, await ctx.tokenFor('role-compras'));
    sales = new ApiClient(ctx, await ctx.tokenFor('role-ventas'));
    treasury = new ApiClient(ctx, await ctx.tokenFor('role-tesoreria'));
    const admin = new ApiClient(ctx, await ctx.tokenFor('role-admin'));
    ledgers = new LedgerProbe(ctx);
    masters = new MasterFixtures(purchases);
    warehouse = await masters.warehouse();
    categoryId = (await masters.category()).id;
    supplier = await masters.supplier(30);
    account = await new MasterFixtures(admin).bankAccount(1000);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const order = async (lines: { productId: string; quantity: number; unitPrice: number }[]) =>
    purchases.create<Totals>('ordenes-compra', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      issuedAt: '2026-10-01',
      lines,
    });

  const receive = async (
    draft: Totals,
    guideNumber: string,
    lines: { productId: string; quantity: number }[],
  ) => {
    await purchases.act('ordenes-compra', draft.id, 'approve');
    return purchases.create<Totals>('recepciones', {
      purchaseOrderId: draft.id,
      guideNumber,
      lines,
    });
  };

  it('rounds prices, IGV, average costs and payments of a purchase like the frontend', async () => {
    const valves: ProductRecord = await masters.product(categoryId, {
      salePrice: 40,
      costPrice: 10,
    });
    const pipes: ProductRecord = await masters.product(categoryId, { salePrice: 6, costPrice: 3 });
    const fittings: ProductRecord = await masters.product(categoryId, {
      salePrice: 6,
      costPrice: 2,
    });
    await masters.stock(valves.id, warehouse.id, 4);

    const draft = await order([
      { productId: valves.id, quantity: 3, unitPrice: 10.555 },
      { productId: pipes.id, quantity: 7, unitPrice: 3.333 },
      { productId: fittings.id, quantity: 2, unitPrice: 2.675 },
    ]);
    // documents.ts 53: 10.555 → 10.56, 3.333 → 3.33, 2.675 → 2.68.
    expect(draft.lines.map((line) => line.unitPrice)).toEqual([10.56, 3.33, 2.68]);
    // documents.ts 9-11: 31.68 + 23.31 + 5.36 = 60.35; IGV round2(10.863) = 10.86; 71.21.
    expect(draft).toMatchObject({ subtotal: 60.35, igv: 10.86, total: 71.21 });

    const receipt = await receive(draft, 'T001-000321', [
      { productId: valves.id, quantity: 3 },
      { productId: pipes.id, quantity: 7 },
      { productId: fittings.id, quantity: 2 },
    ]);
    expect(receipt.subtotal).toBe(60.35);
    // stock.ts 66: round2((4·10.00 + 3·10.56) / 7) = round2(10.2400) = 10.24.
    expect(await ledgers.stock(valves.id, warehouse.id)).toEqual({ quantity: 7, unitCost: 10.24 });
    // stock.ts 31 and 66: a new row starts at the product cost with 0 units and takes the entry cost.
    expect(await ledgers.stock(pipes.id, warehouse.id)).toEqual({ quantity: 7, unitCost: 3.33 });
    // stock.ts 80-81: the kardex keeps the rounded entry cost, not the average.
    expect(await ledgers.kardex(valves.id, receipt.number)).toEqual([
      { origin: 'receipt', quantity: 3, balance: 7, unitCost: 10.56 },
    ]);
    // compras.ts 157: the product cost becomes the rounded order price.
    expect(await ledgers.productCost(valves.id)).toBe(10.56);

    const invoice = await purchases.create<Totals>('facturas-proveedor', {
      documentNumber: 'F001-321',
      receiptId: receipt.id,
      issuedAt: '2026-10-05',
    });
    // documents.ts 14-17: totals from the receipt subtotal 60.35.
    expect(invoice).toMatchObject({ subtotal: 60.35, igv: 10.86, total: 71.21 });
    const payable = pick(
      await purchases.list<Account>(`/cuentas-pagar?supplierId=${supplier.id}`),
      (row) => row.documentNumber === 'F001-321',
      'la cuenta por pagar F001-321',
    );
    expect(payable).toMatchObject({ amount: 71.21, balance: 71.21 });

    const first = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'payment',
      payableId: payable.id,
      amount: 50.555,
    });
    // tesoreria.ts 97: round2(50.555) = 50.56; 142-146: balance 71.21 − 50.56 = 20.65.
    expect(first.amount).toBe(50.56);
    expect(await treasury.one<Account>('cuentas-pagar', payable.id)).toMatchObject({
      paidAmount: 50.56,
      balance: 20.65,
      status: 'partial',
    });
    // tesoreria.ts 28: 1000.00 − 50.56 = 949.44.
    expect(await ledgers.bank(account.id)).toBe(949.44);

    // 20.654 rounds to the exact balance, so the payable is settled without a residue.
    await treasury.create('movimientos', {
      accountId: account.id,
      concept: 'payment',
      payableId: payable.id,
      amount: 20.654,
    });
    expect(await treasury.one<Account>('cuentas-pagar', payable.id)).toMatchObject({
      paidAmount: 71.21,
      balance: 0,
      status: 'paid',
    });
    expect(await ledgers.bank(account.id)).toBe(928.79);
  });

  it('rounds a sale, its credit note and the collection like the frontend', async () => {
    const valves = await masters.product(categoryId, { salePrice: 40, costPrice: 10 });
    const fittings = await masters.product(categoryId, { salePrice: 6, costPrice: 2 });
    await masters.stock(valves.id, warehouse.id, 5);
    await masters.stock(fittings.id, warehouse.id, 5);
    const customer = await masters.customerWithRuc(30, 5000);

    const sale = await sales.create<Totals>('ventas', {
      customerId: customer.id,
      warehouseId: warehouse.id,
      seller: 'Ana Vendedora',
      paymentTerm: 'credit',
      lines: [
        { productId: valves.id, quantity: 2, unitPrice: 33.335 },
        { productId: fittings.id, quantity: 1, unitPrice: 4.445 },
      ],
    });
    // documents.ts 53 and 9-11: 2·33.34 + 4.45 = 71.13; IGV round2(12.8034) = 12.80; 83.93.
    expect(sale.lines.map((line) => line.unitPrice)).toEqual([33.34, 4.45]);
    expect(sale).toMatchObject({ subtotal: 71.13, igv: 12.8, total: 83.93 });
    // stock.ts 80-81: an exit keeps the current average cost.
    expect(await ledgers.kardex(valves.id, sale.number)).toEqual([
      { origin: 'sale', quantity: -2, balance: 3, unitCost: 10 },
    ]);

    const invoice = await sales.create<Totals>('comprobantes', { saleId: sale.id });
    expect(invoice).toMatchObject({ subtotal: 71.13, igv: 12.8, total: 83.93 });
    const receivable = pick(
      await treasury.list<Account>('/cuentas-cobrar'),
      (row) => row.documentNumber === invoice.number,
      'la cuenta por cobrar del comprobante',
    );
    expect(receivable).toMatchObject({ amount: 83.93, balance: 83.93, status: 'pending' });

    const note = await sales.create<Totals>('notas-credito', {
      invoiceId: invoice.id,
      reason: 'return',
      lines: [{ productId: valves.id, quantity: 1 }],
    });
    // comercial.ts 360-363: priced at the invoiced 33.34; IGV round2(6.0012) = 6.00; 39.34.
    expect(note).toMatchObject({ subtotal: 33.34, igv: 6, total: 39.34 });
    // comercial.ts 400-402: balance 83.93 − 39.34 = 44.59.
    expect(await treasury.one<Account>('cuentas-cobrar', receivable.id)).toMatchObject({
      creditedAmount: 39.34,
      balance: 44.59,
      status: 'partial',
    });
    // comercial.ts 388-395: the return comes back at the current average cost.
    expect(await ledgers.stock(valves.id, warehouse.id)).toEqual({ quantity: 4, unitCost: 10 });

    const bank = await ledgers.bank(account.id);
    const collection = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'collection',
      receivableId: receivable.id,
      amount: 44.585,
    });
    // tesoreria.ts 97: round2(44.585) = 44.59, exactly the balance; 124-128 settle the receivable.
    expect(collection.amount).toBe(44.59);
    expect(await treasury.one<Account>('cuentas-cobrar', receivable.id)).toMatchObject({
      paidAmount: 44.59,
      balance: 0,
      status: 'paid',
    });
    expect(await ledgers.bank(account.id)).toBe(Math.round((bank + 44.59) * 100) / 100);
  });

  /*
   * Known divergences. The frontend round2 (context.ts 40-41) adds Number.EPSILON before
   * rounding, which only compensates binary error below 2; above it values such as 5.015 or
   * 13.25·0.18 = 2.385 are stored as …4999 and round down. The backend rounds the exact decimal
   * HALF_UP (src/shared/domain/money/money.ts 3, 9 and 18). These tests pin the backend figure
   * next to the one the frontend would show, so a change on either side is noticed.
   */
  const frontendRound2 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  it('diverges on the IGV of 13.25: frontend 2.38 / 15.63, backend 2.39 / 15.64', async () => {
    const product = await masters.product(categoryId, { salePrice: 20, costPrice: 13 });
    const draft = await order([{ productId: product.id, quantity: 1, unitPrice: 13.25 }]);
    // documents.ts 10-11 vs src/shared/domain/money/igv.ts 43-44.
    expect(frontendRound2(13.25 * 0.18)).toBe(2.38);
    expect(draft).toMatchObject({ subtotal: 13.25, igv: 2.39, total: 15.64 });
  });

  it('diverges on a 5.015 line price: frontend 5.01, backend 5.02', async () => {
    const product = await masters.product(categoryId, { salePrice: 20, costPrice: 5 });
    const draft = await order([{ productId: product.id, quantity: 1, unitPrice: 5.015 }]);
    // documents.ts 53 vs src/shared/domain/lines/document-lines.ts 87.
    expect(frontendRound2(5.015)).toBe(5.01);
    expect(draft.lines.map((line) => line.unitPrice)).toEqual([5.02]);
    expect(draft.subtotal).toBe(5.02);
  });

  it('diverges on a 5.015 movement amount: frontend 5.01, backend 5.02', async () => {
    const before = await ledgers.bank(account.id);
    const movement = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'other',
      type: 'income',
      counterparty: 'Redondeo de prueba',
      amount: 5.015,
    });
    // tesoreria.ts 97 vs src/modules/tesoreria/domain/movement-rules.ts 44.
    expect(frontendRound2(5.015)).toBe(5.01);
    expect(movement.amount).toBe(5.02);
    expect(await ledgers.bank(account.id)).toBe(Math.round((before + 5.02) * 100) / 100);
  });

  it('diverges on the average of 1·7.77 + 3·9.99: frontend 9.43, backend 9.44', async () => {
    const product = await masters.product(categoryId, { salePrice: 20, costPrice: 7.77 });
    await masters.stock(product.id, warehouse.id, 1);
    const draft = await order([{ productId: product.id, quantity: 3, unitPrice: 9.99 }]);
    await receive(draft, 'T001-000944', [{ productId: product.id, quantity: 3 }]);
    // stock.ts 66 vs src/modules/inventario/infrastructure/prisma-stock-ledger.ts 111-119.
    expect(frontendRound2((1 * 7.77 + 3 * 9.99) / 4)).toBe(9.43);
    expect(await ledgers.stock(product.id, warehouse.id)).toEqual({ quantity: 4, unitCost: 9.44 });
  });
});
