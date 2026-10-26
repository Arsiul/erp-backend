import { Money } from '../src/shared/domain/money/money';
import { STOCK_LEDGER, type StockLedger } from '../src/shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/shared/domain/ports/unit-of-work.port';
import { API, bodyOf, E2eContext } from './support/e2e-context';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface DocumentBody {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  igv: number;
  total: number;
}

interface QuoteBody extends DocumentBody {
  saleNumber: string;
  notes: string;
}

interface SaleBody extends DocumentBody {
  quoteId: string;
  invoiceId: string;
  invoiceNumber: string;
}

interface InvoiceBody extends DocumentBody {
  kind: string;
  issuedAt: string;
  dueAt: string;
  creditedAmount: number;
}

interface ReceivableBody {
  id: string;
  invoiceId: string;
  amount: number;
  creditedAmount: number;
  balance: number;
  status: string;
}

interface KardexBody {
  origin: string;
  reference: string;
  balance: number;
  warehouseId: string;
}

interface StockBody {
  warehouseId: string;
  quantity: number;
}

jest.setTimeout(120_000);

describe('Comercial (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let ventas: string;
  let compras: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = ventas) => ctx.http.get(`${API}${path}`).set(auth(token));
  const post = (path: string, body: object, token = ventas) =>
    ctx.http.post(`${API}${path}`).set(auth(token)).send(body);
  const patch = (path: string, body: object, token = ventas) =>
    ctx.http.patch(`${API}${path}`).set(auth(token)).send(body);
  const remove = (path: string, token = ventas) =>
    ctx.http.delete(`${API}${path}`).set(auth(token));

  const stockOf = async (): Promise<number | undefined> => {
    const rows = bodyOf<StockBody[]>(await get('/stock?productId=prod-1', admin).expect(200));
    return rows.find((row) => row.warehouseId === 'wh-1')?.quantity;
  };
  const lastKardex = async (): Promise<KardexBody | undefined> => {
    const rows = bodyOf<KardexBody[]>(await get('/kardex?productId=prod-1', admin).expect(200));
    return rows.find((row) => row.warehouseId === 'wh-1');
  };
  const receivableOf = async (invoiceId: string): Promise<ReceivableBody | undefined> => {
    const rows = bodyOf<ReceivableBody[]>(await get('/cuentas-cobrar').expect(200));
    return rows.find((row) => row.invoiceId === invoiceId);
  };
  const lines = (quantity: number) => [{ productId: 'prod-1', quantity }];

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    ventas = await ctx.tokenFor('role-ventas');
    compras = await ctx.tokenFor('role-compras');
    await ctx.prisma.category.create({ data: { id: 'cat-1', code: 'C1', name: 'Equipos' } });
    await ctx.prisma.product.create({
      data: {
        id: 'prod-1',
        sku: 'LAP-1',
        name: 'Laptop',
        categoryId: 'cat-1',
        unit: 'und',
        salePrice: 100,
        costPrice: 20,
        minStock: 1,
      },
    });
    await ctx.prisma.warehouse.create({ data: { id: 'wh-1', code: 'W1', name: 'Central' } });
    await ctx.prisma.customer.createMany({
      data: [
        {
          id: 'cus-ruc',
          code: 'CL1',
          name: 'Andes SAC',
          documentType: 'RUC',
          documentNumber: '20111111111',
          creditDays: 30,
          creditLimit: 5000,
        },
        {
          id: 'cus-dni',
          code: 'CL2',
          name: 'Ana Pérez',
          documentType: 'DNI',
          documentNumber: '44444444',
        },
      ],
    });
    const ledger = ctx.app.get<StockLedger>(STOCK_LEDGER);
    await ctx.app.get<UnitOfWork>(UNIT_OF_WORK).run(() =>
      ledger.move({
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: 10,
        origin: 'initial',
        reference: 'Saldo inicial',
        date: '2026-10-01',
        unitCost: Money.of('20'),
      }),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('enforces the comercial permissions', async () => {
    await ctx.http.get(`${API}/cotizaciones`).expect(401);
    await get('/cotizaciones', compras).expect(403);
    await post('/ventas', {}, compras).expect(403);
    await get('/cotizaciones').expect(200);
    await get('/cuentas-cobrar').expect(200);
  });

  it('runs a quote from draft to a sale, an invoice and a returned credit note', async () => {
    const quote = bodyOf<QuoteBody>(
      await post('/cotizaciones', {
        customerId: 'cus-ruc',
        seller: 'Ana Ventas',
        lines: lines(2),
      }).expect(201),
    );
    expect(quote).toMatchObject({
      number: 'COT-00001',
      status: 'draft',
      subtotal: 200,
      igv: 36,
      total: 236,
    });
    const edited = bodyOf<QuoteBody>(
      await patch(`/cotizaciones/${quote.id}`, { notes: 'Entrega en obra' }).expect(200),
    );
    expect(edited.notes).toBe('Entrega en obra');

    await post(`/cotizaciones/${quote.id}/fly`, {}).expect(404);
    await post(`/cotizaciones/${quote.id}/send`, {}).expect(200);
    await post(`/cotizaciones/${quote.id}/accept`, {}).expect(200);

    const sale = bodyOf<SaleBody>(
      await post('/ventas', {
        quoteId: quote.id,
        warehouseId: 'wh-1',
        seller: 'Ana Ventas',
        paymentTerm: 'credit',
      }).expect(201),
    );
    expect(sale).toMatchObject({ quoteId: quote.id, status: 'pending_invoice', total: 236 });
    const converted = bodyOf<QuoteBody>(await get(`/cotizaciones/${quote.id}`).expect(200));
    expect(converted).toMatchObject({ status: 'converted', saleNumber: sale.number });
    expect(await stockOf()).toBe(8);
    expect(await lastKardex()).toMatchObject({
      origin: 'sale',
      reference: sale.number,
      balance: 8,
    });

    const invoice = bodyOf<InvoiceBody>(
      await post('/comprobantes', { saleId: sale.id }).expect(201),
    );
    expect(invoice).toMatchObject({
      kind: 'factura',
      number: 'F001-00000001',
      status: 'issued',
      total: 236,
    });
    expect(invoice.dueAt > invoice.issuedAt).toBe(true);
    const invoiced = bodyOf<SaleBody>(await get(`/ventas/${sale.id}`).expect(200));
    expect(invoiced).toMatchObject({ status: 'invoiced', invoiceNumber: invoice.number });
    expect(await receivableOf(invoice.id)).toMatchObject({
      amount: 236,
      balance: 236,
      status: 'pending',
    });
    const ofCustomer = async (customerId: string): Promise<string[]> =>
      bodyOf<ReceivableBody[]>(
        await get(`/cuentas-cobrar?customerId=${customerId}`).expect(200),
      ).map((row) => row.invoiceId);
    expect(await ofCustomer('cus-ruc')).toContain(invoice.id);
    expect(await ofCustomer('cus-dni')).not.toContain(invoice.id);
    await post('/comprobantes', { saleId: sale.id }).expect(422);

    const note = bodyOf<DocumentBody>(
      await post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'return',
        lines: lines(1),
      }).expect(201),
    );
    expect(note).toMatchObject({ number: 'FC01-00000001', total: 118 });
    expect(await stockOf()).toBe(9);
    expect(await lastKardex()).toMatchObject({ origin: 'credit_note', reference: note.number });
    expect(await receivableOf(invoice.id)).toMatchObject({
      creditedAmount: 118,
      balance: 118,
      status: 'partial',
    });
    const over = bodyOf<ErrorBody>(
      await post('/notas-credito', {
        invoiceId: invoice.id,
        reason: 'return',
        lines: lines(5),
      }).expect(422),
    );
    expect(over.code).toBe('BUSINESS_RULE');

    const blocked = bodyOf<ErrorBody>(
      await post(`/comprobantes/${invoice.id}/cancel`, {}).expect(422),
    );
    expect(blocked.message).toBe('El comprobante tiene notas de crédito; ya no se puede anular.');
    await patch(`/comprobantes/${invoice.id}`, {}).expect(405);
    await remove(`/comprobantes/${invoice.id}`).expect(405);
  });

  it('cancels a cash sale and an untouched boleta', async () => {
    await post('/ventas', {
      customerId: 'cus-dni',
      warehouseId: 'wh-1',
      seller: 'Ana Ventas',
      paymentTerm: 'credit',
      lines: lines(1),
    }).expect(422);
    await post('/ventas', {
      customerId: 'cus-dni',
      warehouseId: 'wh-1',
      seller: 'Ana Ventas',
      paymentTerm: 'cash',
      lines: lines(50),
    }).expect(422);

    const sale = bodyOf<SaleBody>(
      await post('/ventas', {
        customerId: 'cus-dni',
        warehouseId: 'wh-1',
        seller: 'Ana Ventas',
        paymentTerm: 'cash',
        lines: lines(3),
      }).expect(201),
    );
    expect(await stockOf()).toBe(6);
    await post(`/ventas/${sale.id}/cancel`, {}).expect(200);
    expect(await stockOf()).toBe(9);
    expect(await lastKardex()).toMatchObject({ origin: 'sale_cancel', reference: sale.number });
    await post(`/ventas/${sale.id}/cancel`, {}).expect(422);

    const billed = bodyOf<SaleBody>(
      await post('/ventas', {
        customerId: 'cus-dni',
        warehouseId: 'wh-1',
        seller: 'Ana Ventas',
        paymentTerm: 'cash',
        lines: lines(1),
      }).expect(201),
    );
    await post('/comprobantes', { saleId: billed.id, kind: 'factura' }).expect(422);
    const boleta = bodyOf<InvoiceBody>(
      await post('/comprobantes', { saleId: billed.id }).expect(201),
    );
    expect(boleta).toMatchObject({ kind: 'boleta', number: 'B001-00000001' });
    expect(boleta.dueAt).toBe(boleta.issuedAt);
    await post(`/ventas/${billed.id}/cancel`, {}).expect(422);

    const cancelled = bodyOf<InvoiceBody>(
      await post(`/comprobantes/${boleta.id}/cancel`, {}).expect(200),
    );
    expect(cancelled.status).toBe('cancelled');
    expect(await receivableOf(boleta.id)).toMatchObject({ balance: 0, status: 'cancelled' });
    const reopened = bodyOf<SaleBody>(await get(`/ventas/${billed.id}`).expect(200));
    expect(reopened).toMatchObject({ status: 'pending_invoice', invoiceId: '' });
  });

  it('removes draft quotes only and reports list totals', async () => {
    const draft = bodyOf<QuoteBody>(
      await post('/cotizaciones', {
        customerId: 'cus-dni',
        seller: 'Ana Ventas',
        lines: lines(1),
      }).expect(201),
    );
    await remove(`/cotizaciones/${draft.id}`).expect(204);
    await get(`/cotizaciones/${draft.id}`).expect(404);
    const converted = bodyOf<QuoteBody[]>(await get('/cotizaciones?status=converted').expect(200));
    expect(converted).toHaveLength(1);
    await remove(`/cotizaciones/${converted[0]?.id ?? ''}`).expect(422);

    const page = await get('/ventas?page=1&pageSize=2').expect(200);
    expect(page.headers['x-total-count']).toBe('3');
    expect(bodyOf<SaleBody[]>(page)).toHaveLength(2);
    const cancelled = await get('/ventas?status=cancelled').expect(200);
    expect(bodyOf<SaleBody[]>(cancelled)).toHaveLength(1);
    await get('/ventas/missing').expect(404);
    await post('/cuentas-cobrar', {}).expect(405);
  });

  it('rejects quantities, prices and totals beyond what the database can store', async () => {
    const cases: [object[], string][] = [
      [lines(2_147_483_648), 'La cantidad de Laptop debe ser un entero mayor que cero.'],
      [
        [{ productId: 'prod-1', quantity: 1, unitPrice: 1e13 }],
        'El precio de Laptop no es válido.',
      ],
      [
        [{ productId: 'prod-1', quantity: 2_000_000_000, unitPrice: 999_999 }],
        'El total del documento supera el máximo permitido.',
      ],
    ];
    for (const [quoteLines, message] of cases) {
      const response = await post('/cotizaciones', {
        customerId: 'cus-dni',
        seller: 'Ana Ventas',
        lines: quoteLines,
      }).expect(422);
      expect(bodyOf<ErrorBody>(response).message).toBe(message);
    }
  });
});
