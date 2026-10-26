import { ApiClient, pick } from './support/ciclos/api-client';
import { addDays, dayOf } from './support/ciclos/dates';
import { LedgerProbe } from './support/ciclos/ledgers';
import { type Identified, MasterFixtures, type ProductRecord } from './support/ciclos/masters';
import { E2eContext } from './support/e2e-context';

/*
 * Every expected figure comes from the frontend mock (erp-frontend/src/services/mocks/business):
 * documents.ts computeTotals 8-12 and normalizeLines 23-56, stock.ts moveStock 52-85,
 * comercial.ts 14-28 (credit exposure), 87-103 (send/accept), 119-175 (sale),
 * 250-300 (comprobante), 351-410 (credit note) and tesoreria.ts 111-133 (collection).
 */

interface Quote {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly saleNumber: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
}

interface Sale {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly quoteNumber: string;
  readonly paymentTerm: string;
  readonly invoiceNumber: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
}

interface Invoice {
  readonly id: string;
  readonly kind: string;
  readonly number: string;
  readonly saleNumber: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly creditedAmount: number;
  readonly status: string;
  readonly total: number;
}

interface CreditNote {
  readonly id: string;
  readonly number: string;
  readonly invoiceNumber: string;
  readonly reason: string;
  readonly subtotal: number;
  readonly igv: number;
  readonly total: number;
}

interface Receivable {
  readonly id: string;
  readonly documentNumber: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly creditedAmount: number;
  readonly balance: number;
  readonly status: string;
}

interface Movement {
  readonly type: string;
  readonly concept: string;
  readonly counterparty: string;
  readonly reference: string;
  readonly amount: number;
  readonly status: string;
}

jest.setTimeout(120_000);

describe('Ciclo comercial (e2e)', () => {
  let ctx: E2eContext;
  let sales: ApiClient;
  let treasury: ApiClient;
  let ledgers: LedgerProbe;
  let warehouse: Identified;
  let company: Identified;
  let person: Identified;
  let drills: ProductRecord;
  let tape: ProductRecord;
  let glue: ProductRecord;
  let account: Identified;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    sales = new ApiClient(ctx, await ctx.tokenFor('role-ventas'));
    treasury = new ApiClient(ctx, await ctx.tokenFor('role-tesoreria'));
    ledgers = new LedgerProbe(ctx);
    const masters = new MasterFixtures(new ApiClient(ctx, await ctx.tokenFor('role-admin')));

    warehouse = await masters.warehouse();
    const category = await masters.category();
    drills = await masters.product(category.id, { salePrice: 25, costPrice: 15 });
    tape = await masters.product(category.id, { salePrice: 9.9, costPrice: 5 });
    glue = await masters.product(category.id, { salePrice: 7, costPrice: 3 });
    company = await masters.customerWithRuc(15, 2000);
    person = await masters.customerWithDni();
    account = await masters.bankAccount(100);
    await masters.stock(drills.id, warehouse.id, 20);
    await masters.stock(tape.id, warehouse.id, 30);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('runs a quote through sale, factura, receivable, collections and a return', async () => {
    const quote = await sales.create<Quote>('cotizaciones', {
      customerId: company.id,
      seller: 'Ana Vendedora',
      lines: [
        { productId: drills.id, quantity: 4, unitPrice: 25 },
        { productId: tape.id, quantity: 10, unitPrice: 9.9 },
      ],
    });
    // computeTotals: 4·25 + 10·9.90 = 199.00; IGV round2(199·0.18) = 35.82; total 234.82.
    expect(quote).toMatchObject({ status: 'draft', subtotal: 199, igv: 35.82, total: 234.82 });
    const early = await sales.rejected(
      sales.post('/ventas', {
        quoteId: quote.id,
        warehouseId: warehouse.id,
        seller: 'Ana Vendedora',
        paymentTerm: 'credit',
      }),
    );
    expect(early.message).toBe(`La cotización ${quote.number} no está aceptada.`);

    expect((await sales.act<Quote>('cotizaciones', quote.id, 'send')).status).toBe('sent');
    expect((await sales.act<Quote>('cotizaciones', quote.id, 'accept')).status).toBe('accepted');

    const otherCustomer = await sales.rejected(
      sales.post('/ventas', {
        quoteId: quote.id,
        customerId: person.id,
        warehouseId: warehouse.id,
        seller: 'Ana Vendedora',
      }),
    );
    expect(otherCustomer.message).toBe('La venta debe ser para el cliente de la cotización.');

    const sale = await sales.create<Sale>('ventas', {
      quoteId: quote.id,
      warehouseId: warehouse.id,
      seller: 'Ana Vendedora',
      paymentTerm: 'credit',
    });
    // comercial.ts 141: without lines the sale takes the quote lines.
    expect(sale).toMatchObject({
      status: 'pending_invoice',
      quoteNumber: quote.number,
      paymentTerm: 'credit',
      subtotal: 199,
      igv: 35.82,
      total: 234.82,
    });
    expect(sale.number).toMatch(/^VTA-\d{5}$/);
    // comercial.ts 162-168: an exit without cost keeps the average cost.
    expect(await ledgers.stock(drills.id, warehouse.id)).toEqual({ quantity: 16, unitCost: 15 });
    expect(await ledgers.quantity(tape.id, warehouse.id)).toBe(20);
    expect(await ledgers.kardex(drills.id, sale.number)).toEqual([
      { origin: 'sale', quantity: -4, balance: 16, unitCost: 15 },
    ]);
    expect(await sales.one<Quote>('cotizaciones', quote.id)).toMatchObject({
      status: 'converted',
      saleNumber: sale.number,
    });
    const closed = await sales.rejected(sales.post(`/cotizaciones/${quote.id}/reject`));
    expect(closed.message).toBe('La cotización ya está cerrada.');

    const invoice = await sales.create<Invoice>('comprobantes', { saleId: sale.id });
    // comercial.ts 256-274: RUC customer → factura F001, credit due date = issue + creditDays.
    expect(invoice).toMatchObject({
      kind: 'factura',
      number: 'F001-00000001',
      saleNumber: sale.number,
      status: 'issued',
      total: 234.82,
      creditedAmount: 0,
    });
    expect(invoice.dueAt).toBe(addDays(dayOf(invoice.issuedAt), 15));
    expect(await sales.one<Sale>('ventas', sale.id)).toMatchObject({
      status: 'invoiced',
      invoiceNumber: 'F001-00000001',
    });
    const twice = await sales.rejected(sales.post('/comprobantes', { saleId: sale.id }));
    expect(twice.message).toBe(`La venta ${sale.number} ya fue facturada o está anulada.`);

    const receivables = await sales.list<Receivable>('/cuentas-cobrar?status=pending');
    const receivable = pick(
      receivables,
      (row) => row.documentNumber === 'F001-00000001',
      'la cuenta por cobrar F001-00000001',
    );
    expect(receivable).toMatchObject({
      documentNumber: 'F001-00000001',
      amount: 234.82,
      paidAmount: 0,
      balance: 234.82,
      status: 'pending',
    });

    // comercial.ts 14-28 and 150-157: available = 2000 − 234.82 = 1765.18;
    // 160·9.90 = 1584.00 + 285.12 IGV = 1869.12 exceeds it.
    const overCredit = await sales.rejected(
      sales.post('/ventas', {
        customerId: company.id,
        warehouseId: warehouse.id,
        seller: 'Ana Vendedora',
        paymentTerm: 'credit',
        lines: [{ productId: tape.id, quantity: 160 }],
      }),
    );
    expect(overCredit.message).toBe(
      `La venta supera el crédito disponible de ${company.name} (S/ 1765.18).`,
    );

    const collection = await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'collection',
      receivableId: receivable.id,
      amount: 100,
    });
    // tesoreria.ts 111-133: income from the customer, reference = document number.
    expect(collection).toMatchObject({
      type: 'income',
      concept: 'collection',
      counterparty: company.name,
      reference: 'F001-00000001',
      amount: 100,
      status: 'posted',
    });
    expect(await ledgers.bank(account.id)).toBe(200);
    expect(await sales.one<Receivable>('cuentas-cobrar', receivable.id)).toMatchObject({
      paidAmount: 100,
      balance: 134.82,
      status: 'partial',
    });
    const overCollection = await treasury.rejected(
      treasury.post('/movimientos', {
        accountId: account.id,
        concept: 'collection',
        receivableId: receivable.id,
        amount: 134.83,
      }),
    );
    expect(overCollection.message).toBe('El cobro supera el saldo de F001-00000001 (S/ 134.82).');

    const note = await sales.create<CreditNote>('notas-credito', {
      invoiceId: invoice.id,
      reason: 'return',
      lines: [{ productId: drills.id, quantity: 1 }],
    });
    // comercial.ts 358-384: priced at the invoiced 25.00 → 25.00 + 4.50 = 29.50, series FC01.
    expect(note).toMatchObject({
      number: 'FC01-00000001',
      invoiceNumber: 'F001-00000001',
      reason: 'return',
      subtotal: 25,
      igv: 4.5,
      total: 29.5,
    });
    // comercial.ts 386-396: the return enters without cost, so the average stays at 15.
    expect(await ledgers.stock(drills.id, warehouse.id)).toEqual({ quantity: 17, unitCost: 15 });
    expect(await ledgers.kardex(drills.id, note.number)).toEqual([
      { origin: 'credit_note', quantity: 1, balance: 17, unitCost: 15 },
    ]);
    expect(await sales.one<Receivable>('cuentas-cobrar', receivable.id)).toMatchObject({
      paidAmount: 100,
      creditedAmount: 29.5,
      balance: 105.32,
      status: 'partial',
    });
    expect((await sales.one<Invoice>('comprobantes', invoice.id)).creditedAmount).toBe(29.5);

    const tooMany = await sales.rejected(
      sales.post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'return',
        lines: [{ productId: drills.id, quantity: 4 }],
      }),
    );
    expect(tooMany.message).toBe(`De ${drills.name} solo quedan 3 unidades por acreditar.`);
    const pricier = await sales.rejected(
      sales.post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'discount',
        lines: [{ productId: drills.id, quantity: 1, unitPrice: 26 }],
      }),
    );
    expect(pricier.message).toBe(`El precio de ${drills.name} supera el facturado.`);
    const foreign = await sales.rejected(
      sales.post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'discount',
        lines: [{ productId: glue.id, quantity: 1, unitPrice: 7 }],
      }),
    );
    expect(foreign.message).toBe(`${glue.name} no está en el comprobante F001-00000001.`);
    // 10·9.90 = 99.00 + 17.82 = 116.82 exceeds the 105.32 still receivable.
    const overNote = await sales.rejected(
      sales.post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'discount',
        lines: [{ productId: tape.id, quantity: 10 }],
      }),
    );
    expect(overNote.message).toBe('La nota (S/ 116.82) supera el saldo por cobrar (S/ 105.32).');
    expect(await ledgers.quantity(tape.id, warehouse.id)).toBe(20);

    await treasury.create<Movement>('movimientos', {
      accountId: account.id,
      concept: 'collection',
      receivableId: receivable.id,
      amount: 105.32,
    });
    expect(await ledgers.bank(account.id)).toBe(305.32);
    expect(await sales.one<Receivable>('cuentas-cobrar', receivable.id)).toMatchObject({
      paidAmount: 205.32,
      creditedAmount: 29.5,
      balance: 0,
      status: 'paid',
    });
    const settled = await treasury.rejected(
      treasury.post('/movimientos', {
        accountId: account.id,
        concept: 'collection',
        receivableId: receivable.id,
        amount: 1,
      }),
    );
    expect(settled.message).toBe('F001-00000001 no tiene saldo por cobrar.');
  });

  it('issues a boleta for a cash sale to a DNI customer and refuses a factura', async () => {
    const credit = await sales.rejected(
      sales.post('/ventas', {
        customerId: person.id,
        warehouseId: warehouse.id,
        seller: 'Ana Vendedora',
        paymentTerm: 'credit',
        lines: [{ productId: tape.id, quantity: 2 }],
      }),
    );
    expect(credit.message).toBe(`${person.name} no tiene crédito aprobado; véndele al contado.`);

    const sale = await sales.create<Sale>('ventas', {
      customerId: person.id,
      warehouseId: warehouse.id,
      seller: 'Ana Vendedora',
      lines: [{ productId: tape.id, quantity: 2 }],
    });
    // comercial.ts 145-149 defaults to cash; the price is the product sale price.
    // 2·9.90 = 19.80; IGV round2(3.564) = 3.56; total 23.36.
    expect(sale).toMatchObject({ paymentTerm: 'cash', subtotal: 19.8, igv: 3.56, total: 23.36 });

    const factura = await sales.rejected(
      sales.post('/comprobantes', { saleId: sale.id, kind: 'factura' }),
    );
    expect(factura.message).toBe('La factura exige un cliente con RUC; emite una boleta.');
    const backdated = await sales.rejected(
      sales.post('/comprobantes', { saleId: sale.id, issuedAt: '2020-01-01' }),
    );
    expect(backdated.message).toBe('El comprobante no puede ser anterior a la venta.');

    const boleta = await sales.create<Invoice>('comprobantes', { saleId: sale.id });
    expect(boleta).toMatchObject({ kind: 'boleta', number: 'B001-00000001', total: 23.36 });
    expect(boleta.dueAt).toBe(dayOf(boleta.issuedAt));

    const note = await sales.create<CreditNote>('notas-credito', {
      invoiceId: boleta.id,
      reason: 'return',
      lines: [{ productId: tape.id, quantity: 1 }],
    });
    // comercial.ts 382-384: a boleta is credited with the BC01 series. 9.90 + 1.78 = 11.68.
    expect(note).toMatchObject({ number: 'BC01-00000001', total: 11.68 });
    expect(await ledgers.quantity(tape.id, warehouse.id)).toBe(19);
  });
});
