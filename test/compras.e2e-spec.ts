import { API, bodyOf, E2eContext } from './support/e2e-context';
import { seedComprasMasters } from './support/compras/compras-fixtures';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface LineBody {
  productId: string;
  quantity: number;
  receivedQuantity: number;
}

interface OrderBody {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  igv: number;
  total: number;
  lines: LineBody[];
}

interface ReceiptBody {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  supplierInvoiceNumber: string;
}

interface InvoiceBody {
  id: string;
  documentNumber: string;
  status: string;
  total: number;
  dueAt: string;
}

interface PayableBody {
  id: string;
  documentNumber: string;
  status: string;
  balance: number;
}

describe('Compras (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let compras: string;
  let tesoreria: string;
  let ventas: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = compras) => ctx.http.get(`${API}${path}`).set(auth(token));
  const post = (path: string, body: object = {}, token = compras) =>
    ctx.http.post(`${API}${path}`).set(auth(token)).send(body);
  const patch = (path: string, body: object, token = compras) =>
    ctx.http.patch(`${API}${path}`).set(auth(token)).send(body);
  const del = (path: string, token = compras) => ctx.http.delete(`${API}${path}`).set(auth(token));

  const stockOf = async (productId: string): Promise<number> =>
    (await ctx.prisma.stockItem.findFirst({ where: { productId, warehouseId: 'w1' } }))?.quantity ??
    0;
  const kardexOf = async (reference: string) =>
    (await ctx.prisma.kardexEntry.findMany({ where: { reference }, orderBy: { seq: 'asc' } })).map(
      (entry) => `${entry.origin} ${entry.productId} ${String(entry.quantity)}`,
    );
  const sequenceOf = async (key: string): Promise<number> =>
    (await ctx.prisma.sequence.findUnique({ where: { key } }))?.value ?? 0;

  const approvedOrder = async (): Promise<OrderBody> => {
    const created = bodyOf<OrderBody>(
      await post('/ordenes-compra', {
        supplierId: 's1',
        warehouseId: 'w1',
        issuedAt: '2026-10-01',
        lines: [
          { productId: 'p1', quantity: 10, unitPrice: 50 },
          { productId: 'p2', quantity: 5 },
        ],
      }).expect(201),
    );
    return bodyOf<OrderBody>(await post(`/ordenes-compra/${created.id}/approve`).expect(200));
  };

  const receive = (orderId: string, lines: object[], guideNumber = 'T001-1') =>
    post('/recepciones', { purchaseOrderId: orderId, guideNumber, lines });

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    compras = await ctx.tokenFor('role-compras');
    tesoreria = await ctx.tokenFor('role-tesoreria');
    ventas = await ctx.tokenFor('role-ventas');
    await seedComprasMasters(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('enforces the compras permissions', async () => {
    await ctx.http.get(`${API}/ordenes-compra`).expect(401);
    for (const resource of [
      'ordenes-compra',
      'recepciones',
      'facturas-proveedor',
      'cuentas-pagar',
    ]) {
      await get(`/${resource}`, ventas).expect(403);
      await get(`/${resource}`, tesoreria).expect(200);
      await get(`/${resource}`, admin).expect(200);
    }
    await post('/ordenes-compra', {}, tesoreria).expect(403);
    await post('/recepciones', {}, tesoreria).expect(403);
    await post('/facturas-proveedor', {}, tesoreria).expect(403);
  });

  it('answers 405 for what the frontend never does', async () => {
    const calls = [
      () => del('/recepciones/x'),
      () => patch('/facturas-proveedor/x', {}),
      () => del('/facturas-proveedor/x'),
      () => post('/cuentas-pagar', {}),
      () => patch('/cuentas-pagar/x', {}),
      () => del('/cuentas-pagar/x'),
    ];
    for (const call of calls) {
      const response = await call().expect(405);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 405,
        code: 'OPERATION_NOT_ALLOWED',
      });
    }
  });

  it('creates, edits, approves and refuses to touch an approved order', async () => {
    const draft = bodyOf<OrderBody>(
      await post('/ordenes-compra', {
        supplierId: 's1',
        warehouseId: 'w1',
        lines: [{ productId: 'p1', quantity: 2 }],
      }).expect(201),
    );
    expect(draft).toMatchObject({ status: 'draft', subtotal: 100, igv: 18, total: 118 });
    expect(draft.number).toMatch(/^OC-\d{5}$/);

    const edited = bodyOf<OrderBody>(
      await patch(`/ordenes-compra/${draft.id}`, {
        lines: [{ productId: 'p2', quantity: 3, unitPrice: 25 }],
      }).expect(200),
    );
    expect(edited).toMatchObject({ subtotal: 75, total: 88.5 });

    await post(`/ordenes-compra/${draft.id}/approve`).expect(200);
    const refused = await patch(`/ordenes-compra/${draft.id}`, { notes: 'x' }).expect(422);
    expect(bodyOf<ErrorBody>(refused)).toMatchObject({
      statusCode: 422,
      code: 'BUSINESS_RULE',
      message: 'Solo se editan órdenes en borrador.',
    });
    await del(`/ordenes-compra/${draft.id}`).expect(422);
    await post(`/ordenes-compra/${draft.id}/close`).expect(404);

    const removable = bodyOf<OrderBody>(
      await post('/ordenes-compra', {
        supplierId: 's2',
        warehouseId: 'w1',
        lines: [{ productId: 'p1', quantity: 1 }],
      }).expect(201),
    );
    await del(`/ordenes-compra/${removable.id}`).expect(204);
    await get(`/ordenes-compra/${removable.id}`).expect(404);

    const inactive = await post('/ordenes-compra', {
      supplierId: 's1',
      warehouseId: 'w-off',
      lines: [{ productId: 'p1', quantity: 1 }],
    }).expect(422);
    expect(bodyOf<ErrorBody>(inactive).message).toBe(
      'No puedes usar el almacén de destino porque está en estado inactivo.',
    );
  });

  it('receives an order in parts, moves stock and kardex, and closes it', async () => {
    const order = await approvedOrder();
    const before = await stockOf('p1');

    const first = bodyOf<ReceiptBody>(
      await receive(order.id, [{ productId: 'p1', quantity: 4 }]).expect(201),
    );
    expect(first).toMatchObject({ status: 'pending_bill', subtotal: 200 });
    expect(await stockOf('p1')).toBe(before + 4);
    expect(await kardexOf(first.number)).toEqual(['receipt p1 4']);
    const partial = bodyOf<OrderBody>(await get(`/ordenes-compra/${order.id}`).expect(200));
    expect(partial.status).toBe('partial');
    expect(partial.lines.map((line) => line.receivedQuantity)).toEqual([4, 0]);

    const tooMany = await receive(order.id, [{ productId: 'p1', quantity: 7 }]).expect(422);
    expect(bodyOf<ErrorBody>(tooMany).message).toBe(
      'De Teclado solo quedan 6 unidades por recibir.',
    );

    await receive(order.id, [
      { productId: 'p1', quantity: 6 },
      { productId: 'p2', quantity: 5 },
    ]).expect(201);
    expect(bodyOf<OrderBody>(await get(`/ordenes-compra/${order.id}`)).status).toBe('received');
    await receive(order.id, [{ productId: 'p1', quantity: 1 }]).expect(422);

    const cancelOrder = await post(`/ordenes-compra/${order.id}/cancel`).expect(422);
    expect(bodyOf<ErrorBody>(cancelOrder).message).toBe(
      'La orden ya recibió mercadería o está cerrada; anula sus recepciones primero.',
    );
  });

  it('cancels a receipt: reverts stock, writes receipt_cancel and reopens the order', async () => {
    const order = await approvedOrder();
    const before = await stockOf('p2');
    const receipt = bodyOf<ReceiptBody>(
      await receive(order.id, [{ productId: 'p2', quantity: 3 }]).expect(201),
    );
    expect(await stockOf('p2')).toBe(before + 3);

    const cancelled = bodyOf<ReceiptBody>(
      await post(`/recepciones/${receipt.id}/cancel`).expect(200),
    );
    expect(cancelled.status).toBe('cancelled');
    expect(await stockOf('p2')).toBe(before);
    expect(await kardexOf(receipt.number)).toEqual(['receipt p2 3', 'receipt_cancel p2 -3']);
    expect(bodyOf<OrderBody>(await get(`/ordenes-compra/${order.id}`)).status).toBe('approved');
    await post(`/recepciones/${receipt.id}/cancel`).expect(422);

    await post(`/ordenes-compra/${order.id}/cancel`).expect(200);
  });

  it('rolls back the whole receipt, sequence included, when it cannot be saved', async () => {
    const order = await approvedOrder();
    const existing = bodyOf<ReceiptBody>(
      await receive(order.id, [{ productId: 'p1', quantity: 1 }]).expect(201),
    );
    const counter = await sequenceOf('recepciones');
    const stock = await stockOf('p1');
    // The next number collides with the receipt just created, so the insert fails at the end.
    await ctx.prisma.sequence.update({
      where: { key: 'recepciones' },
      data: { value: counter - 1 },
    });

    const failed = await receive(order.id, [{ productId: 'p1', quantity: 2 }]).expect(409);
    expect(bodyOf<ErrorBody>(failed).code).toBe('CONFLICT');
    expect(await sequenceOf('recepciones')).toBe(counter - 1);
    expect(await stockOf('p1')).toBe(stock);
    expect(await kardexOf(existing.number)).toEqual(['receipt p1 1']);
    const after = bodyOf<OrderBody>(await get(`/ordenes-compra/${order.id}`));
    expect(after.lines[0]?.receivedQuantity).toBe(1);

    await ctx.prisma.sequence.update({ where: { key: 'recepciones' }, data: { value: counter } });
    await receive(order.id, [{ productId: 'p1', quantity: 2 }]).expect(201);
  });

  it('bills a receipt once, refuses duplicates and frees the receipt when cancelled', async () => {
    const order = await approvedOrder();
    const receipt = bodyOf<ReceiptBody>(
      await receive(order.id, [{ productId: 'p1', quantity: 4 }]).expect(201),
    );

    const invoice = bodyOf<InvoiceBody>(
      await post('/facturas-proveedor', {
        documentNumber: 'f001-77',
        receiptId: receipt.id,
        issuedAt: '2026-10-25',
      }).expect(201),
    );
    expect(invoice).toMatchObject({
      documentNumber: 'F001-77',
      status: 'registered',
      total: 236,
      dueAt: '2026-11-24',
    });
    expect(bodyOf<ReceiptBody>(await get(`/recepciones/${receipt.id}`))).toMatchObject({
      status: 'billed',
      supplierInvoiceNumber: 'F001-77',
    });
    await post(`/recepciones/${receipt.id}/cancel`).expect(422);

    const duplicate = await post('/facturas-proveedor', {
      documentNumber: 'F001-77',
      supplierId: 's1',
      subtotal: 10,
    }).expect(422);
    expect(bodyOf<ErrorBody>(duplicate).message).toBe(
      'Ya registraste la factura F001-77 de Distribuidora Andina.',
    );

    const payables = bodyOf<PayableBody[]>(await get('/cuentas-pagar?supplierId=s1').expect(200));
    const payable = payables.find((row) => row.documentNumber === 'F001-77');
    expect(payable).toMatchObject({ status: 'pending', balance: 236 });
    await post(`/cuentas-pagar/${payable?.id ?? ''}/cancel`).expect(404);

    const cancelled = bodyOf<InvoiceBody>(
      await post(`/facturas-proveedor/${invoice.id}/cancel`).expect(200),
    );
    expect(cancelled.status).toBe('cancelled');
    expect(bodyOf<PayableBody>(await get(`/cuentas-pagar/${payable?.id ?? ''}`)).status).toBe(
      'cancelled',
    );
    expect(bodyOf<ReceiptBody>(await get(`/recepciones/${receipt.id}`))).toMatchObject({
      status: 'pending_bill',
      supplierInvoiceNumber: '',
    });

    await post('/facturas-proveedor', {
      documentNumber: 'F001-77',
      receiptId: receipt.id,
    }).expect(201);
  });

  it('pages lists with X-Total-Count and filters overdue payables', async () => {
    await post('/facturas-proveedor', {
      documentNumber: 'E001-1',
      supplierId: 's2',
      subtotal: 100,
      issuedAt: '2025-01-10',
    }).expect(201);
    await post('/facturas-proveedor', {
      documentNumber: 'E001-2',
      supplierId: 's2',
      subtotal: 100,
      issuedAt: '2026-10-01',
      dueAt: '2099-12-31',
    }).expect(201);

    const overdue = await get('/cuentas-pagar?status=overdue&supplierId=s2&page=1&pageSize=10');
    expect(overdue.status).toBe(200);
    expect(overdue.headers['x-total-count']).toBe('1');
    expect(bodyOf<PayableBody[]>(overdue).map((row) => row.documentNumber)).toEqual(['E001-1']);

    const orders = await get('/ordenes-compra?page=1&pageSize=2').expect(200);
    expect(Number(orders.headers['x-total-count'])).toBeGreaterThan(2);
    expect(bodyOf<OrderBody[]>(orders)).toHaveLength(2);
    const all = await get('/ordenes-compra').expect(200);
    expect(all.headers['x-total-count']).toBeUndefined();

    const receipts = await get('/recepciones?page=1&pageSize=1').expect(200);
    expect(Number(receipts.headers['x-total-count'])).toBeGreaterThan(1);
    const invoices = await get('/facturas-proveedor?supplierId=s2&page=1').expect(200);
    expect(invoices.headers['x-total-count']).toBe('2');
  });
});
