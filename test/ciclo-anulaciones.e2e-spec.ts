import { ApiClient, pick } from './support/ciclos/api-client';
import { LedgerProbe } from './support/ciclos/ledgers';
import { type Identified, MasterFixtures, type ProductRecord } from './support/ciclos/masters';
import { E2eContext } from './support/e2e-context';

/*
 * Every rule and message comes from the frontend mock (erp-frontend/src/services/mocks/business):
 * compras.ts 22-39 (refreshOrder), 97-104 (order cancel), 188-205 (receipt cancel),
 * 286-305 (supplier invoice cancel); comercial.ts 218-238 (sale cancel), 316-333 (comprobante
 * cancel), 353 (credit note on a cancelled comprobante); tesoreria.ts 26-32 (bank balance),
 * 111-151 (collection and payment) and 182-213 (void); stock.ts 52-85 (moveStock).
 */

interface Line {
  readonly receivedQuantity: number;
}

interface Order {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly lines: Line[];
}

interface Receipt {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly supplierInvoiceNumber: string;
}

interface Document {
  readonly id: string;
  readonly number: string;
  readonly status: string;
}

interface Sale extends Document {
  readonly invoiceNumber: string;
}

interface Quote extends Document {
  readonly saleNumber: string;
}

interface Ledger {
  readonly id: string;
  readonly documentNumber: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly balance: number;
  readonly status: string;
}

interface Movement {
  readonly id: string;
  readonly status: string;
}

jest.setTimeout(120_000);

describe('Anulaciones por etapa (e2e)', () => {
  let ctx: E2eContext;
  let purchases: ApiClient;
  let sales: ApiClient;
  let treasury: ApiClient;
  let ledgers: LedgerProbe;
  let warehouse: Identified;
  let supplier: Identified;
  let customer: Identified;
  let valves: ProductRecord;
  let pipes: ProductRecord;
  let account: Identified;

  const message = async (client: ApiClient, path: string, body: object = {}): Promise<string> =>
    (await client.rejected(client.post(path, body))).message;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    purchases = new ApiClient(ctx, await ctx.tokenFor('role-compras'));
    sales = new ApiClient(ctx, await ctx.tokenFor('role-ventas'));
    treasury = new ApiClient(ctx, await ctx.tokenFor('role-tesoreria'));
    ledgers = new LedgerProbe(ctx);
    const masters = new MasterFixtures(new ApiClient(ctx, await ctx.tokenFor('role-admin')));

    warehouse = await masters.warehouse();
    const category = await masters.category();
    valves = await masters.product(category.id, { salePrice: 30, costPrice: 10 });
    pipes = await masters.product(category.id, { salePrice: 30, costPrice: 10 });
    supplier = await masters.supplier(30);
    customer = await masters.customerWithRuc(30, 5000);
    account = await masters.bankAccount(500);
    await masters.stock(valves.id, warehouse.id, 10);
    await masters.stock(pipes.id, warehouse.id, 10);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('reverts a purchase stage by stage and rejects every out-of-order cancellation', async () => {
    const order = await purchases.create<Order>('ordenes-compra', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      lines: [{ productId: valves.id, quantity: 5, unitPrice: 14 }],
    });
    await purchases.act('ordenes-compra', order.id, 'approve');
    const receipt = await purchases.create<Receipt>('recepciones', {
      purchaseOrderId: order.id,
      guideNumber: 'T001-000777',
      lines: [{ productId: valves.id, quantity: 5 }],
    });
    // stock.ts 62-67: round2((10·10 + 5·14) / 15) = 11.33.
    expect(await ledgers.stock(valves.id, warehouse.id)).toEqual({ quantity: 15, unitCost: 11.33 });
    await purchases.create('facturas-proveedor', {
      documentNumber: 'F001-777',
      receiptId: receipt.id,
    });
    const payable = pick(
      await purchases.list<Ledger>('/cuentas-pagar'),
      (row) => row.documentNumber === 'F001-777',
      'la cuenta por pagar F001-777',
    );
    const invoiceId = pick(
      await purchases.list<Document & { documentNumber: string }>('/facturas-proveedor'),
      (row) => row.documentNumber === 'F001-777',
      'la factura F001-777',
    ).id;
    // 70.00 + 12.60 = 82.60.
    expect(payable).toMatchObject({ amount: 82.6, balance: 82.6, status: 'pending' });
    const payment = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'payment',
      payableId: payable.id,
      amount: 30,
    });
    expect(await ledgers.bank(account.id)).toBe(470);

    expect(await message(purchases, `/recepciones/${receipt.id}/cancel`)).toBe(
      'Solo se anulan recepciones sin facturar; anula la factura del proveedor primero.',
    );
    expect(await message(purchases, `/ordenes-compra/${order.id}/cancel`)).toBe(
      'La orden ya recibió mercadería o está cerrada; anula sus recepciones primero.',
    );
    expect(await message(purchases, `/facturas-proveedor/${invoiceId}/cancel`)).toBe(
      'La factura tiene pagos; anúlalos en Tesorería antes.',
    );

    expect((await treasury.act<Movement>('movimientos', payment.id, 'void')).status).toBe('voided');
    expect(await ledgers.bank(account.id)).toBe(500);
    expect(await treasury.one<Ledger>('cuentas-pagar', payable.id)).toMatchObject({
      paidAmount: 0,
      balance: 82.6,
      status: 'pending',
    });
    expect(await message(treasury, `/movimientos/${payment.id}/void`)).toBe(
      'El movimiento ya está anulado.',
    );

    expect((await purchases.act<Document>('facturas-proveedor', invoiceId, 'cancel')).status).toBe(
      'cancelled',
    );
    expect(await purchases.one<Ledger>('cuentas-pagar', payable.id)).toMatchObject({
      balance: 0,
      status: 'cancelled',
    });
    expect(await purchases.one<Receipt>('recepciones', receipt.id)).toMatchObject({
      status: 'pending_bill',
      supplierInvoiceNumber: '',
    });
    expect(await message(purchases, `/facturas-proveedor/${invoiceId}/cancel`)).toBe(
      'La factura ya está anulada.',
    );
    expect(
      await message(treasury, '/movimientos', {
        accountId: account.id,
        concept: 'payment',
        payableId: payable.id,
        amount: 1,
      }),
    ).toBe('F001-777 no tiene saldo por pagar.');

    // The goods were sold meanwhile: the receipt cannot leave the stock negative (stock.ts 55-58).
    const sale = await sales.create<Document>('ventas', {
      customerId: customer.id,
      warehouseId: warehouse.id,
      seller: 'Luis Vendedor',
      lines: [{ productId: valves.id, quantity: 12 }],
    });
    expect(await message(purchases, `/recepciones/${receipt.id}/cancel`)).toBe(
      `Stock insuficiente de ${valves.name} en ${warehouse.name}: hay 3 und.`,
    );
    await sales.act('ventas', sale.id, 'cancel');
    expect(await ledgers.quantity(valves.id, warehouse.id)).toBe(15);

    expect((await purchases.act<Receipt>('recepciones', receipt.id, 'cancel')).status).toBe(
      'cancelled',
    );
    // The exit carries no cost, so the average stays at 11.33 (stock.ts 61-67).
    expect(await ledgers.stock(valves.id, warehouse.id)).toEqual({ quantity: 10, unitCost: 11.33 });
    expect(await ledgers.kardex(valves.id, receipt.number)).toEqual([
      { origin: 'receipt', quantity: 5, balance: 15, unitCost: 14 },
      { origin: 'receipt_cancel', quantity: -5, balance: 10, unitCost: 11.33 },
    ]);
    const reopened = await purchases.one<Order>('ordenes-compra', order.id);
    expect(reopened.status).toBe('approved');
    expect(reopened.lines.map((line) => line.receivedQuantity)).toEqual([0]);
    expect(await message(purchases, `/recepciones/${receipt.id}/cancel`)).toBe(
      'Solo se anulan recepciones sin facturar; anula la factura del proveedor primero.',
    );

    expect((await purchases.act<Order>('ordenes-compra', order.id, 'cancel')).status).toBe(
      'cancelled',
    );
    expect(await message(purchases, `/ordenes-compra/${order.id}/cancel`)).toBe(
      'La orden ya recibió mercadería o está cerrada; anula sus recepciones primero.',
    );
    expect(await ledgers.bank(account.id)).toBe(500);
  });

  it('reverts a sale stage by stage and rejects every out-of-order cancellation', async () => {
    const quote = await sales.create<Quote>('cotizaciones', {
      customerId: customer.id,
      seller: 'Luis Vendedor',
      lines: [{ productId: pipes.id, quantity: 3, unitPrice: 30 }],
    });
    await sales.act('cotizaciones', quote.id, 'send');
    await sales.act('cotizaciones', quote.id, 'accept');
    const saleBody = {
      quoteId: quote.id,
      warehouseId: warehouse.id,
      seller: 'Luis Vendedor',
      paymentTerm: 'credit',
    };

    const first = await sales.create<Sale>('ventas', saleBody);
    expect(await ledgers.quantity(pipes.id, warehouse.id)).toBe(7);
    expect((await sales.act<Sale>('ventas', first.id, 'cancel')).status).toBe('cancelled');
    expect(await ledgers.quantity(pipes.id, warehouse.id)).toBe(10);
    expect(await ledgers.kardex(pipes.id, first.number)).toEqual([
      { origin: 'sale', quantity: -3, balance: 7, unitCost: 10 },
      { origin: 'sale_cancel', quantity: 3, balance: 10, unitCost: 10 },
    ]);
    expect(await sales.one<Quote>('cotizaciones', quote.id)).toMatchObject({
      status: 'accepted',
      saleNumber: '',
    });
    const notInvoiced =
      'Solo se anulan ventas sin facturar; para una facturada, anula el comprobante primero.';
    expect(await message(sales, `/ventas/${first.id}/cancel`)).toBe(notInvoiced);

    const sale = await sales.create<Sale>('ventas', saleBody);
    const invoice = await sales.create<Document>('comprobantes', { saleId: sale.id });
    expect(await message(sales, `/ventas/${sale.id}/cancel`)).toBe(notInvoiced);
    const receivable = pick(
      await sales.list<Ledger>('/cuentas-cobrar'),
      (row) => row.documentNumber === invoice.number,
      'la cuenta por cobrar del comprobante',
    );
    // 90.00 + 16.20 = 106.20.
    expect(receivable).toMatchObject({ amount: 106.2, balance: 106.2, status: 'pending' });

    const collection = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'collection',
      receivableId: receivable.id,
      amount: 50,
    });
    expect(await ledgers.bank(account.id)).toBe(550);
    expect(await message(sales, `/comprobantes/${invoice.id}/cancel`)).toBe(
      'El comprobante tiene cobros; anúlalos en Tesorería antes.',
    );

    // Voiding the collection takes money out: the account must cover it (tesoreria.ts 26-32).
    const expense = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'other',
      type: 'expense',
      counterparty: 'Mantenimiento de local',
      amount: 520,
    });
    expect(await ledgers.bank(account.id)).toBe(30);
    expect(await message(treasury, `/movimientos/${collection.id}/void`)).toBe(
      `${account.name} no tiene saldo suficiente (S/ 30.00).`,
    );
    await treasury.act('movimientos', expense.id, 'void');
    expect(await ledgers.bank(account.id)).toBe(550);

    await treasury.act('movimientos', collection.id, 'void');
    expect(await ledgers.bank(account.id)).toBe(500);
    expect(await sales.one<Ledger>('cuentas-cobrar', receivable.id)).toMatchObject({
      paidAmount: 0,
      balance: 106.2,
      status: 'pending',
    });

    expect((await sales.act<Document>('comprobantes', invoice.id, 'cancel')).status).toBe(
      'cancelled',
    );
    expect(await sales.one<Ledger>('cuentas-cobrar', receivable.id)).toMatchObject({
      balance: 0,
      status: 'cancelled',
    });
    expect(await sales.one<Sale>('ventas', sale.id)).toMatchObject({
      status: 'pending_invoice',
      invoiceNumber: '',
    });
    expect(await ledgers.quantity(pipes.id, warehouse.id)).toBe(7);
    expect(await message(sales, `/comprobantes/${invoice.id}/cancel`)).toBe(
      'El comprobante ya está anulado.',
    );
    expect(
      await message(sales, '/notas-credito', {
        invoiceId: invoice.id,
        reason: 'return',
        lines: [{ productId: pipes.id, quantity: 1 }],
      }),
    ).toBe(`El comprobante ${invoice.number} está anulado.`);
    expect(
      await message(treasury, '/movimientos', {
        accountId: account.id,
        concept: 'collection',
        receivableId: receivable.id,
        amount: 1,
      }),
    ).toBe(`${invoice.number} no tiene saldo por cobrar.`);

    const reissued = await sales.create<Document>('comprobantes', { saleId: sale.id });
    await sales.create('notas-credito', {
      invoiceId: reissued.id,
      reason: 'return',
      lines: [{ productId: pipes.id, quantity: 1 }],
    });
    expect(await ledgers.quantity(pipes.id, warehouse.id)).toBe(8);
    expect(await message(sales, `/comprobantes/${reissued.id}/cancel`)).toBe(
      'El comprobante tiene notas de crédito; ya no se puede anular.',
    );
    expect(await message(sales, `/ventas/${sale.id}/cancel`)).toBe(notInvoiced);
    expect(await ledgers.bank(account.id)).toBe(500);
  });
});
